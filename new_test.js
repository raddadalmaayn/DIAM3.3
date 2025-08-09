'use strict';

const { connect, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { TextDecoder } = require('util');

// --- Configuration ---
const channelName = 'mychannel';
const chaincodeName = 'amprovenance';
const mspId = 'Org1MSP';

// --- Connection Details for the TARGET PEER ---
const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';
const tlsCertPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
const keyDirectoryPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'keystore');
const certPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');
const utf8Decoder = new TextDecoder();

// --- Test Parameters ---
const lightweightTestConfig = { name: 'Lightweight', size: 0, totalTx: 500, concurrency: 50 };
const naiveTestConfig = { name: 'Naive (150KB)', size: 150 * 1024, totalTx: 100, concurrency: 20 };

async function main() {
    console.log('--- Starting Resource Utilization Test ---');

    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        submitOptions: () => ({ deadline: Date.now() + 300000 }), // Long timeout for heavy test
    });

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);
        
        console.log('\n--- IMPORTANT: Make sure the monitor_peer.sh script is running in another terminal! ---');
        console.log('--- Test will begin in 5 seconds... ---');
        await sleep(5000);

        console.log(`\n--- STAGE 1: Testing Throughput: ${lightweightTestConfig.name} ---`);
        await testThroughput(contract, lightweightTestConfig);
        
        console.log(`\n--- Pausing for 10 seconds before next stage... ---`);
        await sleep(10000);

        console.log(`\n--- STAGE 2: Testing Throughput: ${naiveTestConfig.name} ---`);
        await testThroughput(contract, naiveTestConfig);
        
        console.log('\n--- Test complete. You can now stop the monitoring script. ---');

    } finally {
        gateway.close();
        client.close();
    }
}

async function testThroughput(contract, config) {
    const transactions = [];
    for (let i = 0; i < config.totalTx; i++) {
        const assetId = `RESOURCE_TEST_${config.name.replace(/\s+/g, '')}_${Date.now()}_${i}`;
        if (config.size === 0) { // Lightweight model
            const offChainHash = crypto.createHash('sha256').update(`tps_payload_${i}`).digest('hex');
            transactions.push({ func: 'CreateMaterialCertification', args: [assetId, 'TPS-Mat', `TPS-Batch-${i}`, 'TPS-Supplier', offChainHash] });
        } else { // Naive model
            const payload = crypto.randomBytes(config.size).toString('base64');
            transactions.push({ func: 'CreateMaterialCertification_Naive', args: [assetId, 'TPS-Mat-Naive', `TPS-Batch-Naive-${i}`, 'TPS-Supplier-Naive', payload] });
        }
    }

    console.log(`Submitting ${config.totalTx} transactions in chunks of ${config.concurrency}...`);
    const startTime = process.hrtime.bigint();
    
    try {
        for (let i = 0; i < transactions.length; i += config.concurrency) {
            const chunk = transactions.slice(i, i + config.concurrency);
            const promises = chunk.map(tx => contract.submitTransaction(tx.func, ...tx.args));
            await Promise.all(promises);
            process.stdout.write(`Batch ${i/config.concurrency + 1} of ${Math.ceil(transactions.length/config.concurrency)} completed.\r`);
        }
        const endTime = process.hrtime.bigint();
        const totalTimeSec = Number((endTime - startTime) / 1_000_000_000n);
        const tps = config.totalTx / totalTimeSec;
        console.log(`\n*** SUCCESS: Throughput for ${config.name} test: ${tps.toFixed(2)} TPS`);
    } catch (error) {
        console.error(`\n*** FAILED: Throughput test failed. Error:`, error.message.split('\n')[0]);
    }
}

// --- Helper Functions ---
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

main().catch(err => {
    console.error('******** APPLICATION FAILED ********');
    console.error(err);
    process.exitCode = 1;
});
