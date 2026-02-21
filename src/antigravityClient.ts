import * as vscode from 'vscode';
import * as cp from 'child_process';
import { promisify } from 'util';
import * as http2 from 'http2';

const execAsync = promisify(cp.exec);

export class AntigravityClient {
    private port: string | null = null;
    private csrfToken: string | null = null;

    constructor(private outputChannel: vscode.OutputChannel) { }

    public async initialize(): Promise<void> {
        this.outputChannel.appendLine('[API] Discovering Antigravity Language Server...');

        // 1. Get process command line to extract CSRF token
        const wmiCmd = `Get-WmiObject Win32_Process | Where-Object { $_.Name -like '*language_server_windows_x64*' } | Select-Object -First 1 CommandLine`;
        try {
            const { stdout } = await execAsync(`powershell -Command "${wmiCmd}"`);
            const match = stdout.match(/--csrf_token\s+([a-zA-Z0-9]+)/);
            if (match && match[1]) {
                this.csrfToken = match[1];
                this.outputChannel.appendLine(`[API] Found CSRF Token: ${this.csrfToken}`);
            } else {
                throw new Error("Could not extract CSRF token from process arguments.");
            }
        } catch (e: any) {
            throw new Error(`Failed to find Language Server process: ${e.message}`);
        }

        // 2. Find the port using netstat
        const netstatCmd = `netstat -ano | findstr LISTENING`;
        try {
            const { stdout } = await execAsync(netstatCmd);
            const lines = stdout.split('\n');
            const pidsCmd = `Get-WmiObject Win32_Process | Where-Object { $_.Name -like '*language_server_windows_x64*' } | Select-Object -ExpandProperty ProcessId`;
            const { stdout: pidOut } = await execAsync(`powershell -Command "${pidsCmd}"`);
            const pids = pidOut.trim().split('\n').map(p => p.trim()).filter(p => p);

            let foundPort = null;
            for (const line of lines) {
                if (!line.trim()) continue;
                for (const pid of pids) {
                    if (line.endsWith(pid) || line.includes(` ${pid} `) || line.endsWith(` ${pid}\r`)) {
                        const match = line.match(/127\.0\.0\.1:(\d+)/);
                        if (match && match[1]) {
                            foundPort = match[1];
                            break;
                        }
                    }
                }
                if (foundPort) break;
            }

            if (foundPort) {
                this.port = foundPort;
                this.outputChannel.appendLine(`[API] Discovered Port: ${this.port}`);
            } else {
                throw new Error("Could not determine listening port for Language Server.");
            }
        } catch (e: any) {
            throw new Error(`Failed to map Port from Process ID: ${e.message}`);
        }
    }

    private async makeRequest(service: string, method: string, payload: any): Promise<any> {
        if (!this.port || !this.csrfToken) {
            throw new Error("Antigravity Client is not initialized.");
        }

        return new Promise((resolve, reject) => {
            const client = http2.connect(`http://127.0.0.1:${this.port}`);

            client.on('error', (err) => {
                client.close();
                reject(err);
            });

            const path = `/${service}/${method}`;
            const req = client.request({
                ':method': 'POST',
                ':path': path,
                'content-type': 'application/json',
                'connect-protocol-version': '1',
                'x-cursor-csrf-token': this.csrfToken!
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

    public async startCascade(): Promise<string> {
        const reqId = Math.random().toString(36).substring(2, 15);
        const payload = {
            "metadata": {
                "requestId": reqId,
                "sessionId": "discord-bridge-session",
                "requestType": 0,
                "action": "ACTION_CHAT"
            }
        };

        const res = await this.makeRequest('aida.v1.AidaService', 'StartCascade', payload);
        if (res.cascadeId) {
            return res.cascadeId;
        }
        throw new Error(`Failed to start cascade. Response: ${JSON.stringify(res)}`);
    }

    public async sendUserMessage(cascadeId: string, text: string, modelStr: string): Promise<void> {
        const payload = {
            "cascadeId": cascadeId,
            "cascadeConfig": {
                "plannerConfig": {
                    "planModel": modelStr,
                    "requestedModel": {
                        "model": modelStr
                    }
                }
            },
            "turnConfig": {},
            "items": [
                {
                    "text": text
                }
            ]
        };

        await this.makeRequest('aida.v1.AidaService', 'SendUserCascadeMessage', payload);
    }

    public async getCascadeSteps(cascadeId: string): Promise<any[]> {
        const payload = {
            "cascadeId": cascadeId,
            "metadata": {
                "requestId": Math.random().toString(36).substring(2, 15),
                "sessionId": "discord-bridge-session",
                "requestType": 0,
                "action": "ACTION_CHAT"
            }
        };

        const res = await this.makeRequest('aida.v1.AidaService', 'GetCascadeTrajectorySteps', payload);
        return res.steps || [];
    }
}
