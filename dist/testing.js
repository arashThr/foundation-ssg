export class TestSuite {
    desc;
    counter;
    constructor(desc, counter = 0) {
        this.desc = desc;
        this.counter = counter;
    }
    setup() { }
    teardown() { }
    runTests(...allTests) {
        console.log(`--- ${this.desc} ---`);
        const exclusiveTest = allTests.filter(t => t.runExclusively);
        const tests = exclusiveTest.length === 0 ? allTests : exclusiveTest;
        for (let t of tests) {
            this.counter += 1;
            try {
                (() => {
                    this.setup();
                    t.testFunc(this);
                    this.teardown();
                })();
                console.log(`\u001b[32m✔ Test No. ${this.counter}: ${t.desc}\u001b[0m`);
            }
            catch (e) {
                console.log(`\u001b[31m✗ Test No. ${this.counter}: ${t.desc}\u001b[0m - Error:\n`, e);
                return;
            }
        }
    }
}
export function testCase(desc, testFunc, runExclusively = false) {
    return { desc, testFunc, runExclusively };
}
