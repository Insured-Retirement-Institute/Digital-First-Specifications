/**
 * Generates standard HTTP error response shared component files.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { SPECS_SHARED_DIR } from './spec-paths.js';

const ERROR_RESPONSES: Record<string, string> = {
  BadRequestError:
    'Bad Request — the request payload is malformed or fails schema validation.',
  UnauthorizedError:
    'Unauthorized — authentication credentials are missing or invalid.',
  ForbiddenError: 'Forbidden — the caller is not permitted to perform this action.',
  NotFoundError: 'Not Found — the referenced resource does not exist.',
  MethodNotAllowedError:
    'Method Not Allowed — the HTTP method is not supported on this resource.',
  NotAcceptableError: 'Not Acceptable — the requested media type is not supported.',
  ConflictError:
    'Conflict — a transaction for this policy is already in progress or an equivalent request has already been accepted.',
  PayloadTooLargeError:
    'Payload Too Large — the request body exceeds the maximum allowed size.',
  UnsupportedMediaTypeError:
    'Unsupported Media Type — the request Content-Type is not supported.',
  UnprocessableEntityError:
    'Unprocessable Entity — the request is well-formed but fails business rule validation.',
  TooManyRequestsError:
    'Too Many Requests — the caller has exceeded the permitted rate limit.',
  InternalServerError:
    'Internal Server Error — an unexpected condition prevented the request from completing.',
  BadGatewayError: 'Bad Gateway — an upstream system returned an invalid response.',
  ServiceUnavailableError:
    'Service Unavailable — the service is temporarily unable to handle the request.',
  GatewayTimeoutError: 'Gateway Timeout — an upstream system did not respond in time.'
};

function generate(version: number, errorFile: string): void {
  for (const [name, description] of Object.entries(ERROR_RESPONSES)) {
    const fileName = `${name}_v${version}.yaml`;
    const content = `# Modified by Cursor: shared ${name} response (v${version})
components:
  responses:
    ${name}:
      description: ${JSON.stringify(description)}
      headers:
        correlationId:
          $ref: './correlationId_v1.yaml#/components/headers/correlationId'
      content:
        application/json:
          schema:
            $ref: './${errorFile}#/components/schemas/Error'
`;
    fs.writeFileSync(path.join(SPECS_SHARED_DIR, fileName), content);
    console.log(`WROTE  shared/${fileName}`);
  }
}

const versionArg = Number(process.argv[2] ?? 1);
const errorFile = versionArg === 2 ? 'Error_v2.yaml' : 'Error_v1.yaml';
generate(versionArg, errorFile);
