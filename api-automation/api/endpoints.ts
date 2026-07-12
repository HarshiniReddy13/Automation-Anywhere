/**
 * Central registry of every API endpoint this module talks to.
 *
 * This is the "Step 2 — Identify API Endpoints" deliverable made concrete:
 * every entry below was found by driving the real Automation Anywhere
 * Community Edition UI (Navigate → AI → Document Automation → Learning
 * Instances → Create Learning Instance) with network capture, then
 * confirmed independently with direct API calls — not guessed from
 * convention. Where reality diverged from what you'd expect, that's noted
 * inline so nobody "fixes" it back to the wrong assumption later.
 *
 * No endpoint paths are hard-coded anywhere else in this module — every
 * API class below imports from here.
 */

export interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Path template; `{param}` segments are substituted by the caller. */
  path: string;
  description: string;
  /** True if this call needs the `x-authorization` header. False only for the login call itself. */
  requiresAuth: boolean;
}

export const ApiEndpoints = {
  /**
   * Authenticate. Confirmed via live capture: accepts a **plain JSON**
   * `{ username, password }` body over HTTPS — the browser UI additionally
   * performs an ECDH public-key-exchange dance
   * (`POST /v1/authentication/publicKeyExchange`) before this call, but
   * that is UI-specific defense-in-depth, not a server requirement; this
   * endpoint accepts plain credentials directly (verified with a raw,
   * unencrypted request against the live instance).
   */
  AUTHENTICATE: {
    method: 'POST',
    path: '/v2/authentication',
    description: 'Authenticate with username/password, returns a JWT access token (no refresh token issued).',
    requiresAuth: false,
  },

  /**
   * Document-type domains (Invoices, etc.). Confirmed: the "Invoices"
   * domain's `id`, its English `languageProviders[].languageId`, and the
   * "Automation Anywhere (Pre-trained)" provider's
   * `languageProviders[].providers[].id` are exactly the
   * `domainId` / `domainLanguageId` / `domainLanguageProviderId` values
   * `CreateLearningInstanceRequest` requires.
   */
  LIST_DOMAINS: {
    method: 'GET',
    path: '/cognitive/v3/domains',
    description: 'List available document-type domains (Invoice, Receipt, ...) and their language/provider IDs.',
    requiresAuth: true,
  },

  /** Confirmed via live capture during the Create Learning Instance wizard's name field. */
  CHECK_NAME_AVAILABILITY: {
    method: 'GET',
    path: '/cognitive/v3/learninginstances/checkavailability/{name}',
    description: 'Check whether a Learning Instance name is available before creating one.',
    requiresAuth: true,
  },

  /**
   * List Learning Instances. Confirmed request body shape: a
   * filter/sort/page envelope, not query params — this is a POST, not a
   * GET, despite being a read operation (the app's own convention for
   * search-style list endpoints).
   */
  LIST_LEARNING_INSTANCES: {
    method: 'POST',
    path: '/cognitive/v3/learninginstances/list',
    description: 'Search/list Learning Instances with filter, sort, and pagination.',
    requiresAuth: true,
  },

  /**
   * Create a Learning Instance. IMPORTANT — confirmed via live capture AND
   * a direct minimal-payload API call: this returns HTTP 200, not 201.
   * (Use Case 2's spec assumes 201 Created; the real API does not follow
   * that convention. ResponseValidator asserts the *actual* observed
   * status, 200, rather than the assumed one — see its inline note.)
   */
  CREATE_LEARNING_INSTANCE: {
    method: 'POST',
    path: '/cognitive/v3/learninginstances',
    description: 'Create a new Learning Instance for a given document-type domain.',
    requiresAuth: true,
  },

  /** Confirmed via a direct API call (not observed in browser capture, but a live, working endpoint). */
  GET_LEARNING_INSTANCE_BY_ID: {
    method: 'GET',
    path: '/cognitive/v3/learninginstances/{id}',
    description: 'Retrieve a single Learning Instance by ID — used to validate a created instance.',
    requiresAuth: true,
  },

  /**
   * Delete a Learning Instance. Not part of Use Case 2's steps, but
   * confirmed working (returns 204) and included so the test suite can
   * clean up after itself — Community Edition caps accounts at 5 Learning
   * Instances, so uncleaned test data breaks subsequent runs.
   */
  DELETE_LEARNING_INSTANCE: {
    method: 'DELETE',
    path: '/cognitive/v3/learninginstances/{id}',
    description: 'Delete a Learning Instance by ID (used for test cleanup).',
    requiresAuth: true,
  },
} as const satisfies Record<string, EndpointDefinition>;

/** Substitutes `{param}` placeholders in an endpoint path, e.g. `{id}` → the given value. */
export function resolvePath(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`resolvePath: missing parameter "${key}" for template "${template}"`);
    }
    return encodeURIComponent(value);
  });
}
