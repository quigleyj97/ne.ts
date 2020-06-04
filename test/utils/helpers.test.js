import chai from "chai";
import { deep_copy } from "../../lib/index.js";
const expect = chai.expect;

describe("Object cloning", () => {
    const TEST_OBJ = {
        a: 42,
        b: "test",
        5: "foo"
    };

    it("should clone a simple POJO", () => {
        const new_obj = deep_copy(TEST_OBJ);
        expect(new_obj).to.deep.equal(TEST_OBJ);
    });

    it("should throw on cloning a Symbol", () => {
        expect(() => deep_copy(Symbol.species)).to.throw();
    });

    it("should throw on cloning a DataView", () => {
        const test_buf = new DataView(new ArrayBuffer(1));
        expect(() => deep_copy(test_buf)).to.throw();
    });

    it("should clone Arrays", () => {
        const test_arr = [1, 2, 3];
        const copy = deep_copy(test_arr);
        test_arr.push(4);
        expect(copy).to.deep.equal([1, 2, 3]);
    });

    it("should clone TypedArrays", () => {
        // the JVM bytecode magic
        const test_arr = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]);
        const copy = deep_copy(test_arr);
        expect(copy).to.be.instanceOf(Uint8Array);
        expect(copy).to.deep.equal(new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]));
        test_arr[0] = 0xA5;
        expect(copy[0]).to.equal(0xCA);
    });
});
