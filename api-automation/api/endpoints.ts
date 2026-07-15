

export interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  requiresAuth: boolean;
}

export const ApiEndpoints = {

  AUTHENTICATE: {
    method: 'POST',
    path: '/v2/authentication',
    description: 'Authenticate with username/password, returns a JWT access token (no refresh token issued).',
    requiresAuth: false,
  },


  LIST_DOMAINS: {
    method: 'GET',
    path: '/cognitive/v3/domains',
    description: 'List available document-type domains (Invoice, Receipt, ...) and their language/provider IDs.',
    requiresAuth: true,
  },

  CHECK_NAME_AVAILABILITY: {
    method: 'GET',
    path: '/cognitive/v3/learninginstances/checkavailability/{name}',
    description: 'Check whether a Learning Instance name is available before creating one.',
    requiresAuth: true,
  },


  LIST_LEARNING_INSTANCES: {
    method: 'POST',
    path: '/cognitive/v3/learninginstances/list',
    description: 'Search/list Learning Instances with filter, sort, and pagination.',
    requiresAuth: true,
  },


  CREATE_LEARNING_INSTANCE: {
    method: 'POST',
    path: '/cognitive/v3/learninginstances',
    description: 'Create a new Learning Instance for a given document-type domain.',
    requiresAuth: true,
  },

  GET_LEARNING_INSTANCE_BY_ID: {
    method: 'GET',
    path: '/cognitive/v3/learninginstances/{id}',
    description: 'Retrieve a single Learning Instance by ID — used to validate a created instance.',
    requiresAuth: true,
  },


  DELETE_LEARNING_INSTANCE: {
    method: 'DELETE',
    path: '/cognitive/v3/learninginstances/{id}',
    description: 'Delete a Learning Instance by ID (used for test cleanup).',
    requiresAuth: true,
  },
} as const satisfies Record<string, EndpointDefinition>;

export function resolvePath(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`resolvePath: missing parameter "${key}" for template "${template}"`);
    }
    return encodeURIComponent(value);
  });
}
