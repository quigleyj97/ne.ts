import { u8 } from "./types.js";

export function reverseBits(b: u8): u8 {
    b = ((b & 0xF0) >> 4) | ((b & 0x0F) << 4);
    b = ((b & 0xCC) >> 2) | ((b & 0x33) << 2);
    b = ((b & 0xAA) >> 1) | ((b & 0x55) << 1);
    return b;
}

export function deep_copy<T = unknown>(obj: T): T {
    switch (typeof obj) {
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
