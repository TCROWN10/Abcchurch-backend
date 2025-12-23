import { ErrorResponse } from "src/exceptions/global_exception/error_reponse.error";

export class AppResponse<T> {
    success: boolean;
    data: T;
    message: string;
    statusCode: number;
    timestamp: string;
    path: string;

    constructor(data: T, message: string, statusCode: number, path: string) {
        this.success = data instanceof ErrorResponse ? false : true;
        this.data = data;
        this.message = message;
        this.statusCode = data instanceof ErrorResponse ? data.statusCode : statusCode;
        this.timestamp = new Date().toISOString();
        this.path = path;
    }
}
    
export function buildAppResponse<T>(data: T, message: string, statusCode: number, path: string) {
    return new AppResponse(data, message, statusCode, path);
}

