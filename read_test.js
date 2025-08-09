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

// --- Test Parameters ---
const historyLength = 20; // Number of events to add to the asset's history
const delayBetweenWrites = 50; // Delay in ms to prevent overwhelming the network

// --- Connection Details ---
const cryptoPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com');
const keyDirectoryPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'keystore');
const certPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');
const tlsCertPath = path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';


async function main() {
    console.log('--- Starting Read Performance Analysis ---');

    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }), // For query/read
        submitOptions: () => ({ deadline: Date.now() + 15000 }), // For invoke/write
    });

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        // --- Phase 1: Create an Asset with a Long History ---
        const assetId = `READ_TEST_ASSET_${Date.now()}`;
        console.log(`\n--- Preparing asset (${assetId}) with ${historyLength} history records... ---`);
        const historyCreated = await createLongHistoryAsset(contract, assetId, historyLength);
        
        if (!historyCreated) {
            throw new Error('Failed to prepare asset for read test.');
        }
        
        await sleep(2000); // Give network a moment to settle

        // --- Phase 2: Measure Read Performance ---
        console.log(`\n--- Measuring time to read full history for asset ${assetId}... ---`);
        await testReadPerformance(contract, assetId);

    } finally {
        gateway.close();
        client.close();
    }
}

/**
 * Creates a new asset and then updates it multiple times to build a long transaction history.
 * @param {Contract} contract The smart contract instance.
 * @param {string} assetId The ID of the asset to create.
 * @param {number} numHistoryEvents The number of history records to create.
 * @returns {boolean} True if successful, false otherwise.
 */
async function createLongHistoryAsset(contract, assetId, numHistoryEvents) {
    try {
        console.log('Submitting initial CreatePrintJobStart transaction...');
        await contract.submitTransaction(
            'CreatePrintJobStart',
            assetId,
            'READ_TEST_MACHINE',
            'READ_TEST_MATERIAL',
            'READ_TEST_DESIGN_HASH',
            'BUILD_FOR_READ_TEST',
            'dummy_hash_start'
        );
        console.log('Initial asset created. Now adding history...');

        for (let i = 0; i < numHistoryEvents; i++) {
            const offChainHash = crypto.createHash('sha256').update(`history_event_${i}`).digest('hex');
            // We use CreatePrintJobCompletion as a simple way to add a new event to the history
            await contract.submitTransaction(
                'CreatePrintJobCompletion',
                assetId,
                `BUILD_FOR_READ_TEST_${i}`,
                'PASS',
                offChainHash
            );
            process.stdout.write(`Event ${i + 1}/${numHistoryEvents} created.\r`);
            // *** ADDED DELAY TO PREVENT OVERLOADING THE NETWORK ***
            await sleep(delayBetweenWrites);
        }
        console.log(`\nSuccessfully added ${numHistoryEvents} history records.`);
        return true;
    } catch (error) {
        console.error('*** FAILED during history creation phase:', error.message.split('\n')[0]);
        return false;
    }
}

/**
 * Measures the latency of the GetAssetHistory chaincode function.
 * @param {Contract} contract The smart contract instance.
 * @param {string} assetId The ID of the asset whose history to read.
 */
async function testReadPerformance(contract, assetId) {
    const startTime = process.hrtime.bigint();
    try {
        // Use 'evaluateTransaction' for read-only queries. It doesn't get sent to the orderer.
        const historyResultBytes = await contract.evaluateTransaction('GetAssetHistory', assetId);
        
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        
        const historyResult = JSON.parse(Buffer.from(historyResultBytes).toString());

        console.log('\n================== READ PERFORMANCE RESULTS ==================');
        console.log(`*** SUCCESS: Retrieved full asset history.`);
        console.log(`*** Number of Events Retrieved: ${historyResult.length}`);
        console.log(`*** Read Latency: ${latencyMs} ms`);
        console.log('============================================================');

    } catch (error) {
        console.error(`*** FAILED to read asset history. Error:`, error.message.split('\n')[0]);
    }
}


// --- Helper Functions ---
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

// --- Main execution ---
main().catch(error => {
    console.error('******** FAILED to run the application', error);
    process.exitCode = 1;
});
