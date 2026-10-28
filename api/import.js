import handler from '../server.js';
export default function(req, res) { req.url = '/api/import'; return handler(req, res); }
