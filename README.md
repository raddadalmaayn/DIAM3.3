# DIAM3.3 Provenance
# Lightweight Provenance for Additive Manufacturing using Hyperledger Fabric

This repository contains the source code and instructions for a blockchain-based proof-of-concept designed to provide a lightweight, efficient, and auditable provenance trail for components produced via Additive Manufacturing (AM).

The core of this project is a Hyperledger Fabric smart contract (chaincode) that implements a hybrid data model. Essential, verifiable data for each lifecycle event is stored on-chain, while a cryptographic hash links to voluminous off-chain data (e.g., machine logs, CAD files, QA reports), thus ensuring scalability and cost-effectiveness.

## 1. Prerequisites

Before you begin, ensure you have the following installed on your **Ubuntu** system:

* **curl** and **git**
* **Go** (Version 1.21.x or higher)
* **Docker** and **Docker Compose**

## 2. Setup and Deployment

These steps will guide you through setting up the Hyperledger Fabric test network, creating the chaincode, and deploying it.

### Step 2.1: Install Prerequisites and Fabric Samples

If you haven't already set up the environment, run the following commands in your Ubuntu terminal.

```bash
# Update package lists and install essential tools
sudo apt-get update
sudo apt-get -y install curl git build-essential

# Install Docker
sudo apt-get -y install apt-transport-https ca-certificates gnupg-agent software-properties-common
curl -fsSL [https://download.docker.com/linux/ubuntu/gpg](https://download.docker.com/linux/ubuntu/gpg) | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] [https://download.docker.com/linux/ubuntu](https://download.docker.com/linux/ubuntu) $(lsb_release -cs) stable"
sudo apt-get update
sudo apt-get -y install docker-ce docker-ce-cli containerd.io

# Add your user to the docker group (Requires logout/login)
sudo usermod -aG docker $USER
echo "IMPORTANT: Please log out and log back in now to apply Docker permissions."
# After logging back in, proceed.

# Install Go
wget [https://go.dev/dl/go1.21.0.linux-amd64.tar.gz](https://go.dev/dl/go1.21.0.linux-amd64.tar.gz)
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
rm go1.21.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
source ~/.profile

# Download Fabric Samples and Binaries
mkdir -p $HOME/fabric
cd $HOME/fabric
curl -sSLO [https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh](https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh) && chmod +x install-fabric.sh
./install-fabric.sh docker samples binary
```

### Step 2.2: Start the Fabric Test Network

Navigate to the test network directory and start the network. This creates two organizations, their peers, and an ordering service.

```bash
cd $HOME/fabric/fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
```
Your network should now be running. You can verify this with `docker ps`.

### Step 2.3: Create the Chaincode

1.  **Create the directory for our chaincode:**
    ```bash
    mkdir -p $HOME/fabric/fabric-samples/chaincode/am-provenance
    ```

2.  **Create the Go source file** `am_provenance.go` inside that new directory and add the following code:

    ```go
    // File: $HOME/fabric/fabric-samples/chaincode/am-provenance/am_provenance.go
    package main

    import (
    	"encoding/json"
    	"fmt"
    	"time"

    	"[github.com/hyperledger/fabric-contract-api-go/contractapi](https://github.com/hyperledger/fabric-contract-api-go/contractapi)"
    )

    // SmartContract provides functions for managing AM provenance
    type SmartContract struct {
    	contractapi.Contract
    }

    // Asset represents the core item being tracked on the blockchain.
    type Asset struct {
    	AssetID             string   `json:"assetID"`
    	Owner               string   `json:"owner"`
    	CurrentLifecycleStage string `json:"currentLifecycleStage"`
    	HistoryTxIDs        []string `json:"historyTxIDs"`
    }

    // ProvenanceEvent defines the structure for our lightweight on-chain records.
    type ProvenanceEvent struct {
    	EventType         string `json:"eventType"`
    	AgentID           string `json:"agentID"`
    	Timestamp         string `json:"timestamp"`
    	OffChainDataHash  string `json:"offChainDataHash"`
    	MaterialType           string `json:"materialType,omitempty"`
    	MaterialBatchID        string `json:"materialBatchID,omitempty"`
    	SupplierID             string `json:"supplierID,omitempty"`
    	DesignFileHash         string `json:"designFileHash,omitempty"`
    	DesignFileVersion      string `json:"designFileVersion,omitempty"`
    	MachineID              string `json:"machineID,omitempty"`
    	MaterialBatchUsedID    string `json:"materialBatchUsedID,omitempty"`
    	BuildJobID             string `json:"buildJobID,omitempty"`
    	PrimaryInspectionResult string `json:"primaryInspectionResult,omitempty"`
    	TestStandardApplied    string `json:"testStandardApplied,omitempty"`
    	FinalTestResult        string `json:"finalTestResult,omitempty"`
    	CertificateID          string `json:"certificateID,omitempty"`
    }

    // recordEvent is an internal helper function
    func (s *SmartContract) recordEvent(ctx contractapi.TransactionContextInterface, event ProvenanceEvent) (string, error) {
    	txID := ctx.GetStub().GetTxID()
    	event.Timestamp = time.Now().UTC().Format(time.RFC3339)

    	eventJSON, err := json.Marshal(event)
    	if err != nil {
    		return "", fmt.Errorf("failed to marshal event JSON: %v", err)
    	}

    	err = ctx.GetStub().PutState("EVENT_"+txID, eventJSON)
    	if err != nil {
    		return "", fmt.Errorf("failed to put event state: %v", err)
    	}
    	return txID, nil
    }

    // CreateMaterialCertification records the certification of a new batch of raw material.
    func (s *SmartContract) CreateMaterialCertification(ctx contractapi.TransactionContextInterface, assetID string, materialType string, materialBatchID string, supplierID string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	exists, err := s.AssetExists(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	if exists {
    		return fmt.Errorf("the asset %s already exists", assetID)
    	}
    	event := ProvenanceEvent{
    		EventType:       "MATERIAL_CERTIFICATION",
    		AgentID:         clientMSPID,
    		OffChainDataHash:  offChainDataHash,
    		MaterialType:    materialType,
    		MaterialBatchID: materialBatchID,
    		SupplierID:      supplierID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             assetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "MATERIAL_CERTIFIED",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }
    
    // ... (All other chaincode functions: CreatePrintJobStart, CreatePrintJobCompletion, CreateQACertify, etc.) ...
    
    // ReadAsset returns the asset stored in the world state with the given id.
    func (s *SmartContract) ReadAsset(ctx contractapi.TransactionContextInterface, assetID string) (*Asset, error) {
    	assetJSON, err := ctx.GetStub().GetState(assetID)
    	if err != nil {
    		return nil, fmt.Errorf("failed to read from world state: %v", err)
    	}
    	if assetJSON == nil {
    		return nil, fmt.Errorf("the asset %s does not exist", assetID)
    	}
    	var asset Asset
    	err = json.Unmarshal(assetJSON, &asset)
    	if err != nil {
    		return nil, err
    	}
    	return &asset, nil
    }

    // GetAssetHistory returns the full provenance history of an asset.
    func (s *SmartContract) GetAssetHistory(ctx contractapi.TransactionContextInterface, assetID string) ([]*ProvenanceEvent, error) {
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return nil, err
    	}
    	var history []*ProvenanceEvent
    	for _, txID := range asset.HistoryTxIDs {
    		eventKey := "EVENT_" + txID
    		eventJSON, err := ctx.GetStub().GetState(eventKey)
    		if err != nil {
    			fmt.Printf("Warning: could not retrieve event for txID %s: %v\n", txID, err)
    			continue
    		}
    		if eventJSON == nil {
    			fmt.Printf("Warning: no event found for txID %s\n", txID)
    			continue
    		}
    		var event ProvenanceEvent
    		err = json.Unmarshal(eventJSON, &event)
    		if err != nil {
    			fmt.Printf("Warning: could not unmarshal event for txID %s: %v\n", txID, err)
    			continue
    		}
    		history = append(history, &event)
    	}
    	return history, nil
    }

    // AssetExists returns true when asset with given ID exists in world state
    func (s *SmartContract) AssetExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
    	assetJSON, err := ctx.GetStub().GetState(id)
    	if err != nil {
    		return false, fmt.Errorf("failed to read from world state: %v", err)
    	}
    	return assetJSON != nil, nil
    }

    func main() {
    	chaincode, err := contractapi.NewChaincode(&SmartContract{})
    	if err != nil {
    		fmt.Printf("Error creating AM provenance chaincode: %v", err)
    		return
    	}
    	if err := chaincode.Start(); err != nil {
    		fmt.Printf("Error starting AM provenance chaincode: %v", err)
    	}
    }
    ```

3.  **Prepare the Go module dependencies:**
    ```bash
    cd $HOME/fabric/fabric-samples/chaincode/am-provenance
    go get [github.com/hyperledger/fabric-contract-api-go/contractapi](https://github.com/hyperledger/fabric-contract-api-go/contractapi)
    go mod vendor
    ```

### Step 2.4: Deploy and Test the Chaincode

1.  **Navigate back to the `test-network` directory:**
    ```bash
    cd $HOME/fabric/fabric-samples/test-network
    ```
2.  **Deploy the chaincode.** Use the absolute path to your chaincode folder.
    ```bash
    ./network.sh deployCC -ccn amprovenance -ccp $HOME/fabric/fabric-samples/chaincode/am-provenance -ccl go
    ```
    Wait for the command to complete successfully.

3.  **Test the chaincode by invoking a transaction.**
    * First, set the environment variables to act as Org1's admin:
        ```bash
        export PATH=${PWD}/../bin:$PATH
        export FABRIC_CFG_PATH=$PWD/../config/
        export CORE_PEER_TLS_ENABLED=true
        export CORE_PEER_LOCALMSPID="Org1MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)
        export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/[org1.example.com/users/Admin@org1.example.com/msp](https://org1.example.com/users/Admin@org1.example.com/msp)
        export CORE_PEER_ADDRESS=localhost:7051
        ```
    * Now, invoke the chaincode to create a material batch. This command gets the required signatures from both Org1 and Org2.
        ```bash
        peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/[example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem](https://example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem)" -C mychannel -n amprovenance --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org2.example.com/peers/peer0.org2.example.com/tls/ca.crt](https://org2.example.com/peers/peer0.org2.example.com/tls/ca.crt)" -c '{"function":"CreateMaterialCertification","Args":["MATERIAL_BATCH_001", "Ti6Al4V", "POWDER-XYZ-789", "SupplierCorpMSP", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]}'
        ```
4.  **Query the ledger to verify the transaction.**
    ```bash
    # Wait a few seconds for the block to commit
    sleep 3
    
    # Query for the asset
    peer chaincode query -C mychannel -n amprovenance -c '{"Args":["ReadAsset","MATERIAL_BATCH_001"]}'
    ```
    **Expected Output:**
    ```json
    {"assetID":"MATERIAL_BATCH_001","owner":"Org1MSP","currentLifecycleStage":"MATERIAL_CERTIFIED","historyTxIDs":["..."]}
    ```

## 3. Troubleshooting

* **`permission denied while trying to connect to the Docker daemon`**: You did not log out and log back in after being added to the `docker` group. Alternatively, run `newgrp docker` in your terminal to start a new shell session with the correct permissions.
* **`cannot find module providing package...` or `no dependencies to vendor`**: You missed a step in preparing the Go module. Navigate to your chaincode directory (`chaincode/am-provenance`) and run `go get ...` followed by `go mod vendor`.
* **`invalid character U+005C '\'`**: You have extra backslashes in your Go source code from a bad copy-paste. Recopy the "clean" version of the code into the file.
* **`endorsement policy failure`**: Your `invoke` command did not get signatures from all required organizations. Make sure your `peer chaincode invoke` command includes the `--peerAddresses` flags for both Org1 and Org2.

## 4. Cleanup

To shut down the Fabric test network and remove all containers, run the following command from the `test-network` directory:

```bash
./network.sh down
