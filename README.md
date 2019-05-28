The example below shows how to use this package in a class. It is advised to create a separate file for each set of routes and export the routes as shown below. Supported types for parameters are string, number, boolean, ObjectID and Date which means these types will automatically be type-checked. For more complex types, the type of the parameter cannot be assumed and should be checked manually.

```typescript
import express from "express";

import { get, ParamsType, post, use } from "express-requesthandler";

export class Routes {
    // The router which will be populated by the generated routes
    public static router: express.Router;

    // This is a GET route which gets its parameters from the query parameters
    @get(ParamsType.QUERY)
    public static someRoute1(param1: string, param2: number): void {

    }

    // This is a POST route which gets its parameters from the body
    @post(ParamsType.BODY)
    public static someRoute2(param1: string, param2: number): void {

    }

    // This is a middleware route which gets its parameters from the headers
    // The return value of this route will be available in the next route under the identifier "user"
    @use(ParamsType.HEADERS, "user")
    public static someRoute3(param1: string, param2: number): string {
        return "userId";
    }

    // This is an example of how to use the previous middleware function
    @get(ParamsType.QUERY)
    public static someRoute4(user: string): void {
        // The parameter user should now be "userId"
    }
}

export default Routes.router;
```

The router can then be used as follows.

```typescript
import express from "express";
import routes from "./routes";

const app = express();

app.use("/routes", routes);

// Listen
app.listen(3000, () => {
    console.log("Listening on port 3000");
});
```