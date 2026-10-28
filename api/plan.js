import handler from '../server.js';
export default function(req, res) { req.url = '/api/plan'; return handler(req, res); }
