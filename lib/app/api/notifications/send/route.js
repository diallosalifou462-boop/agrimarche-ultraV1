"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
exports.GET = GET;
const server_1 = require("next/server");
async function POST(request) {
    console.log('✅ API appelée');
    return server_1.NextResponse.json({ success: true, message: 'API fonctionne' });
}
async function GET() {
    return server_1.NextResponse.json({ message: 'API est en ligne. Utilisez POST.' });
}
