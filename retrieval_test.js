'use strict';

const { connect, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const channelName = 'mychannel';
const chaincodeName = 'amprovenance';
const mspId = 'Org1MSP';

// --- Test Parameters ---
// We will test the read latency for assets with these different history lengths.
const historyLengthsToTest = [10, 50, 100, 150, 200]; 

// --- Connection Details ---
const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';
const tlsCertPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
const keyDirectoryPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'keystore');
const certPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');


async function main() {
    console.log('--- Starting Iterative Read Latency Performance Test ---');

    const client = await newGrpcConnection();
    const gateway = connect({ client, identity: await newIdentity(), signer: await newSigner() });
    
    const results = [];

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        for (const length of historyLengthsToTest) {
            const assetId = `READ_TEST_LEN_${length}_${Date.now()}`;
            console.log(`\n--- Preparing asset (${assetId}) with ${length} records... ---`);
            const setupSuccess = await createLongHistoryAsset(contract, assetId, length);
            if (!setupSuccess) {
                console.error(`Skipping test for history length ${length} due to setup failure.`);
                continue;
            }
            
            console.log(`\n--- Measuring read latency for history of length ${length}... ---`);
            const latencyMs = await testRetrievalLatency(contract, assetId);
            if (latencyMs > 0) {
                results.push({
                    'History Length (Events)': length,
                    'Read Latency (ms)': latencyMs,
                });
            }
            await sleep(2000); // Pause between tests
        }

    } finally {
        gateway.close();
        client.close();
        console.log('\n\n================== FINAL READ LATENCY RESULTS (for Colab) ==================');
        console.table(results);
        console.log('============================================================================');
    }
}

async function createLongHistoryAsset(contract, assetId, historyLength) {
    try {
        await contract.submitTransaction('CreateMaterialCertification', assetId, 'TestMat', 'TestBatch', 'TestSupplier', 'initial_hash');
        console.log('Initial asset created. Now adding history...');
        
        for (let i = 0; i < historyLength - 1; i++) {
            const offChainHash = crypto.createHash('sha256').update(`history_event_${i}`).digest('hex');
            await contract.submitTransaction('AddHistoryEvent', assetId, `EVENT_${i}`, offChainHash);
            process.stdout.write(`Event ${i + 2}/${historyLength} created.\r`);
            await sleep(50); 
        }
        console.log(`\nSuccessfully prepared asset with ${historyLength} history records.`);
        return true;
    } catch (error) {
        console.error('\n*** FAILED during history creation phase:', error);
        return false;
    }
}

async function testRetrievalLatency(contract, assetId) {
    try {
        const startTime = process.hrtime.bigint();
        const resultBytes = await contract.evaluateTransaction('GetAssetHistory', assetId);
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        
        const result = JSON.parse(Buffer.from(resultBytes).toString());
        console.log(`Successfully retrieved ${result.events.length} events. Latency: ${latencyMs} ms`);
        return latencyMs;
    } catch (error) {
        console.error(`*** FAILED to read asset history:`, error);
        return -1; // Return -1 to indicate failure
    }
}

// --- Helper Functions ---
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
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
