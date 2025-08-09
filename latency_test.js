'use strict';

const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const channelName = 'mychannel';
const chaincodeName = 'amprovenance';
const mspId = 'Org1MSP';

// --- Connection Details ---
const cryptoPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com');
const keyDirectoryPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'keystore');
const certPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');
const tlsCertPath = path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';

// --- DYNAMIC TEST PLAN (ULTIMATE STRESS TEST) ---
const throughputPayloads = [
    { name: 'Lightweight', size: 1, count: 1000, concurrency: 100 }, // Massive stress test for lightweight
    { name: 'Naive (10KB)', size: 10 * 1024, count: 100, concurrency: 50 },
    { name: 'Naive (50KB)', size: 50 * 1024, count: 100, concurrency: 50 },
    { name: 'Naive (1MB)', size: 1* 1024 * 1024, count: 20, concurrency: 5 },
    { name: 'Naive (2MB)', size: 2 * 1024 * 1024, count: 20, concurrency: 5}
];


async function main() {
    console.log(`--- Starting Final Ultimate Stress Test ---`);

    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        endorseOptions: () => ({ deadline: Date.now() + 30000 }), // 30 second deadline for endorsement
        submitOptions: () => ({ deadline: Date.now() + 600000 }), // 10 minute deadline for heavy tests
        commitStatusOptions: () => ({ deadline: Date.now() + 600000 }),
    });

    const results = [];

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        // --- Warm-up Run ---
        console.log('--- Performing warm-up transaction... ---');
        await warmup(contract);
        await sleep(1000);

        // === Run all throughput tests based on the dynamic plan ===
        for (const test of throughputPayloads) {
            console.log(`\n--- Testing Throughput: ${test.name} (${test.count} TXs @ ${test.concurrency} concurrency) ---`);
            const tps = await testThroughput(contract, test.size, test.count, test.concurrency);
            results.push({
                'Test Case': test.name,
                'Payload per TX': test.size === 0 ? '~270 Bytes' : `${(test.size / 1024)} KB`,
                'TX Count': test.count,
                'Throughput (TPS)': tps.toFixed(2),
            });
            await sleep(2000); // Pause between tests to let the network settle
        }

    } finally {
        gateway.close();
        client.close();
        printFinalResults(results);
    }
}

// --- Test Functions ---

async function warmup(contract) {
    const assetId = `WARMUP_BATCH_${Date.now()}`;
    const offChainHash = crypto.createHash('sha256').update('warmup_payload').digest('hex');
    try {
        await contract.submitTransaction('CreateMaterialCertification', assetId, 'Ti6Al4V', 'POWDER-WARMUP', 'SupplierCorpMSP', offChainHash);
        console.log('Warm-up complete.');
    } catch (error) {
        console.error('Warm-up failed:', error);
    }
}

async function testThroughput(contract, payloadSize = 0, txCount, concurrency) {
    const transactions = [];
    for (let i = 0; i < txCount; i++) {
        const assetId = `TPS_${payloadSize}_${Date.now()}_${i}`;
        if (payloadSize === 0) { // Lightweight model
            const offChainHash = crypto.createHash('sha256').update(`tps_payload_${i}`).digest('hex');
            transactions.push({
                func: 'CreateMaterialCertification',
                args: [assetId, 'TPS-Mat', `TPS-Batch-${i}`, 'TPS-Supplier', offChainHash]
            });
        } else { // Naive model
            const payload = crypto.randomBytes(payloadSize).toString('base64');
            transactions.push({
                func: 'CreateMaterialCertification_Naive',
                args: [assetId, 'TPS-Mat-Naive', `TPS-Batch-Naive-${i}`, 'TPS-Supplier-Naive', payload]
            });
        }
    }

    const payloadKB = (payloadSize / 1024).toFixed(0);
    console.log(`Submitting ${txCount} transactions in chunks of ${concurrency}, with ${payloadKB}KB payload each...`);
    const startTime = process.hrtime.bigint();
    
    try {
        for (let i = 0; i < transactions.length; i += concurrency) {
            const chunk = transactions.slice(i, i + concurrency);
            const promises = chunk.map(tx => contract.submitTransaction(tx.func, ...tx.args));
            await Promise.all(promises);
            console.log(`Batch ${Math.floor(i/concurrency) + 1} of ${Math.ceil(transactions.length/concurrency)} completed.`);
        }

        const endTime = process.hrtime.bigint();
        const totalTimeMs = Number((endTime - startTime) / 1000000n);
        const totalTimeSec = totalTimeMs / 1000;
        const tps = txCount / totalTimeSec;
        
        console.log(`*** SUCCESS: All ${txCount} transactions committed.`);
        console.log(`Total time: ${totalTimeSec.toFixed(2)} seconds.`);
        console.log(`Throughput: ${tps.toFixed(2)} TPS`);
        return tps;

    } catch (error) {
        console.error(`*** FAILED: Throughput test failed for payload size ${payloadKB}KB. Error:`, error.message.split('\n')[0]);
        return 0;
    }
}


// --- Helper & Printing Functions ---

function printFinalResults(results) {
    console.log('\n\n==================== FINAL DYNAMIC LOAD THROUGHPUT RESULTS ====================');
    console.table(results);
    console.log('=============================================================================');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
        'grpc.max_send_message_length': -1,
        'grpc.max_receive_message_length': -1,
    });
}
async function newIdentity() {
    const cert = await fs.readFile(certPath);
    return { mspId, credentials: cert };
}
async function newSigner() {
    const files = await fs.readdir(keyDirectoryPath);
    const keyPath = path.resolve(keyDirectoryPath, files[0]);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

main().catch(error => {
    console.error('******** FAILED to run the application', error);
    process.exitCode = 1;
});
