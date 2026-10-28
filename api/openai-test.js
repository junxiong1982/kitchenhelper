import handler from '../server.js';
export default function(req, res) { req.url = '/api/openai-test'; return handler(req, res); }
