import chai from "chai";
import { foo } from "../lib/index.js";

const expect = chai.expect;

describe("Hello Mocha", () => {
    it("should have a foo", () => {
        expect(foo).to.equal("test");
    });
});
