export function deep_copy<T = unknown>(obj: T): T {
    switch (typeof obj) {
        case "bigint":
        case "boolean":
        case "number":
        case "string":
            return obj;
        case "object":
            if (obj == null) {
                return obj;
            }
            // we know it's an object because of the typeof
            return deep_copy_obj(obj as unknown as object);
        case "function":
        case "symbol":
        default:
            throw new Error("Cannot copy functions or symbols");
    }
}

function deep_copy_obj(obj: object) {
    // first test if this is a regular array
    if (Array.isArray(obj)) {
        const new_arr = new Array(obj.length);
        for (let i = 0; i < obj.length; i++) {
            new_arr[i] = deep_copy(obj[i]);
        }
        return new_arr;
    }
    // now test if it's a typed array
    if (ArrayBuffer.isView(obj)) {
        if (!(obj as ArrayBufferView & {slice?: any}).slice) {
            throw Error("Cannot copy buffers directly");
        }
        return (obj as any).slice()
    }
    // finally, treat it as an object
    const new_obj: Record<string, unknown> = {};
    for (const [property, value] of Object.entries(obj)) {
        new_obj[property] = deep_copy(value);
    }
    return new_obj;
}
