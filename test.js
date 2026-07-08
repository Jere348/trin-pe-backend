const bcrypt = require('bcryptjs');

async function run() {
    try {
        await bcrypt.compare('test', null);
        console.log("compare(test, null) works");
    } catch (e) {
        console.log("compare(test, null) throws:", e.message);
    }
    
    try {
        await bcrypt.compare(undefined, 'somehash');
        console.log("compare(undefined, hash) works");
    } catch (e) {
        console.log("compare(undefined, hash) throws:", e.message);
    }
    
    try {
        await bcrypt.compare(null, 'somehash');
        console.log("compare(null, hash) works");
    } catch (e) {
        console.log("compare(null, hash) throws:", e.message);
    }
}
run();
