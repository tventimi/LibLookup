import * as https from 'https'
import * as fs from 'node:fs';

export class webserver {
    headers = {
        'Access-Control-Allow-Origin': '*', /* @dev First, read about security */
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
        'Access-Control-Max-Age': 2592000, // 30 days
        'Content-Type': 'text/html'
    }; 

    serverOptions = {
        key: fs.readFileSync('./webserver/server.key'),
        cert: fs.readFileSync('./webserver/server.crt')
    };

    constructor(content) {
        const server = https.createServer(this.serverOptions, (req, res) => {
            if (req.method === 'OPTIONS') {
                res.writeHead(204, this.headers);
                res.end();
                return;
            } else {
                res.writeHead(200, this.headers);
                res.end(content)
                return
            }
        });
        server.listen(3950, '127.0.0.1', () => {
            console.log('Electron app listening for HTTPS calls on https://127.0.0.1:3950');
        });
        return server
    }
}