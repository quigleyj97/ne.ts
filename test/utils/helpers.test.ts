import { deep_copy, reverseBits } from "../../src/index.js";

describe("Object cloning", () => {
    const TEST_OBJ = {
        a: 42,
        b: "test",
        5: "foo"
    };

    it("should clone a simple POJO", () => {
        const new_obj = deep_copy(TEST_OBJ);
        expect(new_obj).toEqual(TEST_OBJ);
    });

    it("should throw on cloning a Symbol", () => {
        expect(() => deep_copy(Symbol.species)).toThrow();
    });

    it("should throw on cloning a DataView", () => {
        const test_buf = new DataView(new ArrayBuffer(1));
        expect(() => deep_copy(test_buf)).toThrow();
    });

    it("should clone Arrays", () => {
        const test_arr = [1, 2, 3];
        const copy = deep_copy(test_arr);
        test_arr.push(4);
        expect(copy).toEqual([1, 2, 3]);
    });

    it("should clone TypedArrays", () => {
        // the JVM bytecode magic
        const test_arr = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]);
        const copy = deep_copy(test_arr);
        expect(copy).toBeInstanceOf(Uint8Array);
        expect(copy).toEqual(new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]));
        test_arr[0] = 0xA5;
        expect(copy[0]).toBe(0xCA);
    });
});

describe("Bit reversal", () => {
    it("should reverse bits correctly for 0x00", () => {
        expect(reverseBits(0x00)).toBe(0x00);
    });

    it("should reverse bits correctly for 0xFF", () => {
        expect(reverseBits(0xFF)).toBe(0xFF);
    });

    it("should reverse bits correctly for 0x01", () => {
        // 00000001 -> 10000000
        expect(reverseBits(0x01)).toBe(0x80);
    });

    it("should reverse bits correctly for 0x80", () => {
        // 10000000 -> 00000001
        expect(reverseBits(0x80)).toBe(0x01);
    });

    it("should reverse bits correctly for 0xF0", () => {
        // 11110000 -> 00001111
        expect(reverseBits(0xF0)).toBe(0x0F);
    });

    it("should reverse bits correctly for 0x0F", () => {
        // 00001111 -> 11110000
        expect(reverseBits(0x0F)).toBe(0xF0);
    });

    it("should reverse bits correctly for 0xAA", () => {
        // 10101010 -> 01010101
        expect(reverseBits(0xAA)).toBe(0x55);
    });

    it("should reverse bits correctly for 0x55", () => {
        // 01010101 -> 10101010
        expect(reverseBits(0x55)).toBe(0xAA);
    });

    it("should reverse bits correctly for a sprite pattern 0xC3", () => {
        // 11000011 -> 11000011 (palindrome)
        expect(reverseBits(0xC3)).toBe(0xC3);
    });

    it("should reverse bits correctly for a sprite pattern 0x18", () => {
        // 00011000 -> 00011000 (palindrome)
        expect(reverseBits(0x18)).toBe(0x18);
    });

    it("should reverse bits correctly for a sprite pattern 0x3C", () => {
        // 00111100 -> 00111100 (palindrome)
        expect(reverseBits(0x3C)).toBe(0x3C);
    });
});
