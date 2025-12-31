// chai removed;
import { readFileSync } from "fs";
import { NesEmulator, CartridgeMapperFactory, parse_line, test_log_lines_eq } from "../../lib/index.js";



const NESTEST_PATH = "./test/data/nestest.nes";
const GOLDLOG_PATH = "./test/data/nestest.log";

describe("NESTEST", () => {
    /** @type {import("../../src/index").NesEmulator} */
    let nes;
    /** @type {import("../../src/index").ICartridge} */
    let cart;
    /** @type {String[]} */
    let gold_log;

    beforeAll(() => {
        const buf = readFileSync(NESTEST_PATH);
        gold_log = readFileSync(GOLDLOG_PATH, "utf8").split("\n");
        cart = CartridgeMapperFactory.from_buffer(buf);
        nes = new NesEmulator(cart);
        // set the PC to the automated testing entry point
        nes.cpu.state.pc = 0xC000;
    });
    
    it("should execute NESTEST", () => {
        let line = 1;

        for (const gold_line of gold_log) {
            let log = nes.step_debug();
            let log_parsed = parse_line(log);
            let gold_parsed = parse_line(gold_line);
            // uncomment this line when tracking down integ fails
            // console.log("L"+(line+"    ").slice(0,4)+" "+log);
            test_log_lines_eq(log_parsed, gold_parsed, chai.assert);
            line += 1;
            if (line > 5003) {
                break; // beyond line 5003 are unimplemented illegal opcodes
            }
        }
    });
})