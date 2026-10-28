import handler from '../server.js';
export default function(req, res) { req.url = '/'; return handler(req, res); }
