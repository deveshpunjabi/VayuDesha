import { requestHandler } from '../server/index.mjs';

export default function handler(req, res) {
  return requestHandler(req, res);
}
