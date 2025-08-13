    package main

    import (
    	"encoding/json"
    	"fmt"
    	"time"

    	"github.com/hyperledger/fabric-contract-api-go/contractapi"
    )

    // SmartContract provides functions for managing AM provenance
    type SmartContract struct {
    	contractapi.Contract
    }

    // =========================================================================================
    //                             DATA STRUCTURES
    // =========================================================================================

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
    	OffChainDataHash  string `json:"offChainDataHash,omitempty"` // Omit if empty for Naive model
    	OnChainDataPayload string `json:"onChainDataPayload,omitempty"` // For Naive model
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

    // =========================================================================================
    //                             CHAINCODE FUNCTIONS
    // =========================================================================================

    // recordEvent is an internal helper function that creates a new ProvenanceEvent,
    // stores it on the ledger using its transaction ID as the key, and returns the txID.
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
    // This is our efficient LIGHTWEIGHT model.
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
    		EventType:       "MATERIAL_CERTIFICATION_LIGHTWEIGHT",
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

    // #######################################################################################
    // #                            NEW NAIVE MODEL FUNCTION                                 #
    // #######################################################################################

    // CreateMaterialCertification_Naive records the certification by storing the ENTIRE data payload on-chain.
    // This is our inefficient NAIVE model for performance comparison.
    func (s *SmartContract) CreateMaterialCertification_Naive(ctx contractapi.TransactionContextInterface, assetID string, materialType string, materialBatchID string, supplierID string, fullDataPayload string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	// Use a different assetID to avoid conflict with the lightweight test
    	naiveAssetID := "NAIVE_" + assetID
    	exists, err := s.AssetExists(ctx, naiveAssetID)
    	if err != nil {
    		return err
    	}
    	if exists {
    		return fmt.Errorf("the asset %s already exists", naiveAssetID)
    	}
    	event := ProvenanceEvent{
    		EventType:         "MATERIAL_CERTIFICATION_NAIVE",
    		AgentID:           clientMSPID,
    		OnChainDataPayload: fullDataPayload, // Storing the large payload
    		MaterialType:      materialType,
    		MaterialBatchID:   materialBatchID,
    		SupplierID:        supplierID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             naiveAssetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "MATERIAL_CERTIFIED_NAIVE",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(naiveAssetID, assetJSON)
    }

    // #######################################################################################
    // #                         (Other functions remain the same)                           #
    // #######################################################################################

    // CreatePrintJobStart records the commencement of a print job.
    func (s *SmartContract) CreatePrintJobStart(ctx contractapi.TransactionContextInterface, assetID string, machineID string, materialBatchUsedID string, designFileHash string, buildJobID string, offChainDataHash string) error {
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
    		EventType:           "PRINT_JOB_START",
    		AgentID:             clientMSPID,
    		OffChainDataHash:      offChainDataHash,
    		MachineID:           machineID,
    		MaterialBatchUsedID: materialBatchUsedID,
    		DesignFileHash:      designFileHash,
    		BuildJobID:          buildJobID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             assetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "IN_PRODUCTION",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

    // CreatePrintJobCompletion updates an existing asset after printing is complete.
    func (s *SmartContract) CreatePrintJobCompletion(ctx contractapi.TransactionContextInterface, assetID string, buildJobID string, inspectionResult string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	event := ProvenanceEvent{
    		EventType:               "PRINT_JOB_COMPLETION",
    		AgentID:                 clientMSPID,
    		OffChainDataHash:          offChainDataHash,
    		BuildJobID:              buildJobID,
    		PrimaryInspectionResult: inspectionResult,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset.CurrentLifecycleStage = "AWAITING_QA"
    	asset.HistoryTxIDs = append(asset.HistoryTxIDs, txID)
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

    // CreateQACertify updates an existing asset with quality assurance results.
    func (s *SmartContract) CreateQACertify(ctx contractapi.TransactionContextInterface, assetID string, testStandard string, testResult string, certificateID string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	event := ProvenanceEvent{
    		EventType:           "QA_CERTIFY",
    		AgentID:             clientMSPID,
    		OffChainDataHash:      offChainDataHash,
    		TestStandardApplied: testStandard,
    		FinalTestResult:     testResult,
    		CertificateID:       certificateID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	if testResult == "CERTIFIED_FIT_FOR_USE" {
    		asset.CurrentLifecycleStage = "CERTIFIED"
    	} else {
    		asset.CurrentLifecycleStage = "REJECTED"
    	}
    	asset.HistoryTxIDs = append(asset.HistoryTxIDs, txID)
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

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
    
