const cp = require('child_process');
const util = require('util');
const http2 = require('http2');
const execAsync = util.promisify(cp.exec);

async function test() {
    console.log('[API] Discovering Antigravity Language Server...');
    let csrfToken, port;
    const wmiCmd = `Get-WmiObject Win32_Process | Where-Object { $_.Name -like '*language_server_windows_x64*' } | Select-Object -First 1 CommandLine`;
    try {
        const { stdout } = await execAsync(`powershell -Command "${wmiCmd}"`);
        const match = stdout.match(/--csrf_token\s+([a-zA-Z0-9]+)/);
        if (match && match[1]) {
            csrfToken = match[1];
            console.log(`[API] Found CSRF Token: ${csrfToken}`);
        } else {
            throw new Error("Could not extract CSRF token");
        }
    } catch (e) {
        throw new Error(`Failed: ${e.message}`);
    }

    const netstatCmd = `netstat -ano | findstr LISTENING`;
    try {
        const { stdout } = await execAsync(netstatCmd);
        const lines = stdout.split('\n');
        const pidsCmd = `Get-WmiObject Win32_Process | Where-Object { $_.Name -like '*language_server_windows_x64*' } | Select-Object -ExpandProperty ProcessId`;
        const { stdout: pidOut } = await execAsync(`powershell -Command "${pidsCmd}"`);
        const pids = pidOut.trim().split('\n').map(p => p.trim()).filter(p => p);

        for (const line of lines) {
            if (!line.trim()) continue;
            for (const pid of pids) {
                if (line.endsWith(pid) || line.includes(` ${pid} `) || line.endsWith(` ${pid}\r`)) {
                    const match = line.match(/127\.0\.0\.1:(\d+)/);
                    if (match && match[1]) {
                        port = match[1];
                        break;
                    }
                }
            }
            if (port) break;
        }

        if (port) {
            console.log(`[API] Discovered Port: ${port}`);
        } else {
            throw new Error("Could not determine port");
        }
    } catch (e) {
        throw new Error(`Failed: ${e.message}`);
    }

    function makeRequest(service, method, payload) {
        return new Promise((resolve, reject) => {
            const client = http2.connect(`http://127.0.0.1:${port}`);
            const path = `/${service}/${method}`;
            const req = client.request({
                ':method': 'POST',
                ':path': path,
                'content-type': 'application/json',
                'connect-protocol-version': '1',
                'x-cursor-csrf-token': csrfToken
            });
            req.on('response', (headers) => {
                let data = '';
                req.on('data', (chunk) => { data += chunk; });
                req.on('end', () => {
                    client.close();
                    if (headers[':status'] !== 200) {
                        reject(new Error(`HTTP ${headers[':status']}: ${data}`));
                    } else {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            resolve(data);
                        }
                    }
                });
            });
            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    // Try a dummy HandleCascadeUserInteraction
    try {
        const payload = {
            "cascadeId": "dummy-id",
            "interaction": {
                "accept": {}
            }
        };
        const res = await makeRequest('aida.v1.AidaService', 'HandleCascadeUserInteraction', payload);
        console.log("Response:", res);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
