


export class ErrorResponse {
    statusCode: number;
    message: string;
    timestamp: string;
    path: string;

    constructor(statusCode: number, message: string, path: string) {
        this.statusCode = statusCode;
        this.message = message;
        this.timestamp = new Date().toISOString();
        this.path = path;
    }
}

export function buildErrorResponse(statusCode: number, message: string, path: string) {
    return new ErrorResponse(statusCode, message, path);
}