import assert from "assert";
import { ObjectID } from "bson";
import express from "express";
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

export const Get = (paramsType: ParamsType, middleware?: string) => Request(RequestType.GET, paramsType, middleware);
export const Post = (paramsType: ParamsType, middleware?: string) => Request(RequestType.POST, paramsType, middleware);
export const Use = (paramsType: ParamsType, middleware?: string) => Request(RequestType.USE, paramsType, middleware);

function functionParameters(target: any, key: string): { key: string, type: any }[] {
    const fstr = target[key].toString();

    // Extract arguments from string representation of function
    const args = fstr.slice(fstr.indexOf("(") + 1, fstr.indexOf(")")).match(/[^\s,]+/g) as string[];
    const types = Reflect.getMetadata("design:paramtypes", target, key);

    // Return arguments with their types
    return args.map((key, i) => ({ key, type: types[i] }));
}

export const Request = (type: RequestType, paramsType: ParamsType, middleware?: string) => {
    return (target: any, key: string) => {
        // Create the class-scoped router if it does not exist
        if (!target.router) {
            target.router = express.Router();
        }

        // Extract the arguments from the function
        let args = functionParameters(target, key);

        if (paramsType === ParamsType.HEADERS) {
            args = args.map(arg => ({ key: arg.key.toLowerCase(), type: arg.type }));
        }

        target.router[type]("/" + (type !== RequestType.USE ? key : ""), (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
                                assert.fail(`Parameter ${arg.key} is missing in ` + key);
                            }
                        } catch (e) {
                            res.status(400).json({ error: e.message });
                            return;
                        }
                        break;
                }
            }

            // Execute function
            const result = new Promise(resolve => resolve(target[key].call(target, ...argValues)));

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
