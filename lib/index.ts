import assert from "assert";
import { ObjectID } from "bson";
import { NextFunction, Request, Response } from "express";
import "reflect-metadata";

export class ExpressError extends Error {
    constructor(message?: string, public status?: number) {
        super(message);
    }
}

export const get = (middleware?: boolean) => request("get", middleware);
export const post = (middleware?: boolean) => request("post", middleware);
export const use = (middleware?: boolean) => request("use", middleware);

export const request = (type: "get" | "post" | "use", middleware = false) => {
    return (target: any, method: string, desc: PropertyDescriptor) => {
        if (!target.router) {
            throw new Error("The class should have a static router variable");
        }

        // Extract the arguments from the function
        const fstr = desc.value.toString() as string;

        // Extract arguments from string representation of function
        const argKeys = fstr.slice(fstr.indexOf("(") + 1, fstr.indexOf(")")).match(/[^\s,]+/g)!;
        const argTypes = Reflect.getMetadata("design:paramtypes", target, method);
        const args = argKeys.map((key, i) => ({ key, type: argTypes[i] }));

        target.router[type]("/" + (type !== "use" ? method : ""), (req: Request, res: Response, next: NextFunction) => {
            // Extract arguments from params
            const argValues: any[] = [];
            let respond = true;

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
                            } else if (arg.key in req.query || arg.key in req.body || arg.key.toLowerCase() in req.headers) {
                                let param = arg.key in req.query ? req.query[arg.key] : (arg.key in req.body ? req.body[arg.key] : req.headers[arg.key.toLowerCase()]);

                                switch (arg.type) {
                                    case String:
                                        assert(typeof param === "string", `Parameter ${arg.key} should be a string`);
                                        break;

                                    case Number:
                                        assert(!isNaN(+param), `Parameter ${arg.key} should be a number`);
                                        param = +param;
                                        break;

                                    case Boolean:
                                        // tslint:disable-next-line: triple-equals
                                        param = param == 1;
                                        break;

                                    case ObjectID:
                                        assert(ObjectID.isValid(param), `Parameter ${arg.key} should be an ObjectID`);
                                        param = new ObjectID(param);
                                        break;

                                    case Date:
                                        param = new Date(param);
                                        assert(!isNaN(param.getTime()), `Parameter ${arg.key} should be a Date`);
                                        break;

                                    case Array:
                                        if (typeof param === "string") {
                                            try {
                                                param = JSON.parse(param);
                                            } catch (e) {
                                                param = "";
                                            }
                                        }

                                        assert(param instanceof Array, `Parameter ${arg.key} should be an array`);
                                        break;
                                }

                                argValues.push(param);
                            } else {
                                assert.fail(`Parameter ${arg.key} is missing in ` + method);
                            }
                        } catch (err) {
                            res.status(400).json({ error: err.message || err.toString() });
                            return;
                        }
                        break;
                }
            }

            // Execute function
            const result = new Promise(resolve => resolve(desc.value.call(target, ...argValues)));

            // Send result to user
            result.then((doc: any) => {
                if (respond) {
                    if (middleware) {
                        for (const key in doc) {
                            res.locals[key] = doc[key];
                        }

                        next();
                    } else {
                        res.json(doc);
                    }
                }
            }, (err: ExpressError) => {
                try {
                    res.status(err.status ? err.status : 500).json({ error: err.message || err.toString() });
                } catch {
                    res.write(JSON.stringify({ error: err.message || err.toString() }));
                    res.end();
                }
            });
        });
    };
};
