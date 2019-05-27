import assert from "assert";
import { ObjectID } from "bson";
import express, { NextFunction, Request, Response } from "express";
import "reflect-metadata";

export enum RequestType {
    GET = "get",
    POST = "post",
    USE = "use"
}

export enum ParamsType {
    QUERY = "query",
    BODY = "body",
    HEADERS = "headers"
}

export const get = (paramsType: ParamsType, middleware?: string) => request(RequestType.GET, paramsType, middleware);
export const post = (paramsType: ParamsType, middleware?: string) => request(RequestType.POST, paramsType, middleware);
export const use = (paramsType: ParamsType, middleware?: string) => request(RequestType.USE, paramsType, middleware);

function functionParameters(target: any, method: string): { key: string, type: any }[] {
    const fstr = target[method].toString() as string;

    // Extract arguments from string representation of function
    const args = fstr.slice(fstr.indexOf("(") + 1, fstr.lastIndexOf(")")).match(/[^\s,]+/g)!;
    const types = Reflect.getMetadata("design:paramtypes", target, method);

    // Return arguments with their types
    return args.map((key, i) => ({ key, type: types[i] }));
}

export const request = (type: RequestType, paramsType: ParamsType, middleware?: string) => {
    return (target: any, method: string, desc: PropertyDescriptor) => {
        // Create the class-scoped router if it does not exist
        if (!target.router) {
            target.router = express.Router();
        }

        // Extract the arguments from the function
        const args = functionParameters(target, method);

        if (paramsType === ParamsType.HEADERS) {
            args.forEach(arg => arg.key = arg.key.toLowerCase());
        }

        target.router[type]("/" + (type !== RequestType.USE ? method : ""), (req: Request, res: Response, next: NextFunction) => {
            // Determine params
            const params = req[paramsType];
            let respond = true;

            // Extract arguments from params
            const argValues: any[] = [];

            for (const arg of args) {
                switch (arg.key) {
                    case "req":
                        argValues.push(req);
                        break;

                    case "res":
                        argValues.push(res);
                        respond = false;
                        break;

                    default:
                        try {
                            if (arg.key in res.locals) {
                                argValues.push(res.locals[arg.key]);
                            } else if (arg.key in params) {
                                switch (arg.type) {
                                    case String:
                                        assert(typeof params[arg.key] === "string", `Parameter ${arg} should be a string`);
                                        break;

                                    case Number:
                                        assert(!isNaN(params[arg.key]), `Parameter ${arg} should be a number`);
                                        params[arg.key] = +params[arg.key];
                                        break;

                                    case Boolean:
                                        // tslint:disable-next-line: triple-equals
                                        params[arg.key] = params[arg.key] == 1;
                                        break;

                                    case ObjectID:
                                        assert(ObjectID.isValid(params[arg.key]), `Parameter ${arg} should be an ObjectID`);
                                        params[arg.key] = new ObjectID(params[arg.key]);
                                        break;

                                    case Date:
                                        params[arg.key] = new Date(params[arg.key]);
                                        assert(!isNaN(params[arg.key].getTime()), `Parameter ${arg} should be a Date`);
                                        break;

                                    case Array:
                                        if (typeof params[arg.key] === "string") {
                                            try {
                                                params[arg.key] = JSON.parse(params[arg.key]);
                                            } catch (e) {
                                                params[arg.key] = "";
                                            }
                                        }

                                        assert(params[arg.key] instanceof Array, `Parameter ${arg} should be an array`);
                                        break;
                                }

                                argValues.push(params[arg.key]);
                            } else {
                                assert.fail(`Parameter ${arg.key} is missing in ` + method);
                            }
                        } catch (e) {
                            res.status(400).json({ error: e.message });
                            return;
                        }
                        break;
                }
            }

            // Execute function
            const result = new Promise(resolve => resolve(desc.value.call(target, ...argValues)));

            // Send result to user
            result.then(doc => {
                if (respond) {
                    if (middleware) {
                        res.locals[middleware] = doc;
                        next();
                    } else {
                        res.json(doc);
                    }
                }
            }, err => {
                try {
                    res.status(500).json({ error: err.toString() });
                } catch {
                    res.write(JSON.stringify({ error: err.toString() }));
                    res.end();
                }
            });
        });
    };
};
