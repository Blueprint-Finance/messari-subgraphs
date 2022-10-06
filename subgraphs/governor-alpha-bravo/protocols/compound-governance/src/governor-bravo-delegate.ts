import { Address } from "@graphprotocol/graph-ts";
import {
  ProposalCanceled,
  ProposalCreated,
  ProposalExecuted,
  ProposalQueued,
  ProposalThresholdSet,
  VoteCast,
  VotingDelaySet,
  VotingPeriodSet,
} from "../../../generated/GovernorBravoDelegate/GovernorBravoDelegate";
import {
  _handleProposalCreated,
  _handleProposalCanceled,
  _handleProposalExecuted,
  _handleProposalQueued,
  _handleVoteCast,
  getProposal,
  getGovernance,
} from "../../../src/handlers";
import { GovernorBravoDelegate } from "../../../generated/GovernorBravoDelegate/GovernorBravoDelegate";
import { GovernanceFramework, Proposal } from "../../../generated/schema";
import {
  BIGINT_ONE,
  GovernanceFrameworkType,
  NA,
  ProposalState,
} from "../../../src/constants";

// ProposalCanceled(proposalId)
export function handleProposalCanceled(event: ProposalCanceled): void {
  _handleProposalCanceled(event.params.id.toString(), event);
}

// ProposalCreated(proposalId, proposer, targets, values, signatures, calldatas, startBlock, endBlock, description)
export function handleProposalCreated(event: ProposalCreated): void {
  let quorumVotes = GovernorBravoDelegate.bind(event.address).quorumVotes();

  // FIXME: Prefer to use a single object arg for params
  // e.g.  { proposalId: event.params.proposalId, proposer: event.params.proposer, ...}
  // but graph wasm compilation breaks for unknown reasons
  _handleProposalCreated(
    event.params.id.toString(),
    event.params.proposer.toHexString(),
    event.params.targets,
    event.params.values,
    event.params.signatures,
    event.params.calldatas,
    event.params.startBlock,
    event.params.endBlock,
    event.params.description,
    quorumVotes,
    event
  );
}

// ProposalExecuted(proposalId)
export function handleProposalExecuted(event: ProposalExecuted): void {
  _handleProposalExecuted(event.params.id.toString(), event);
}

// ProposalQueued(proposalId, eta)
export function handleProposalQueued(event: ProposalQueued): void {
  _handleProposalQueued(event.params.id, event.params.eta, event);
}

// ProposalThresholdSet(oldProposalThreshold,newProposalThreshold)
export function handleProposalThresholdSet(event: ProposalThresholdSet): void {
  let governanceFramework = getGovernanceFramework(event.address.toHexString());
  governanceFramework.proposalThreshold = event.params.newProposalThreshold;
  governanceFramework.save();
}

function getLatestProposalValues(
  proposalId: string,
  contractAddress: Address
): Proposal {
  let proposal = getProposal(proposalId);

  // On first vote, set state and quorum values
  if (proposal.state == ProposalState.PENDING) {
    let contract = GovernorBravoDelegate.bind(contractAddress);
    proposal.state = ProposalState.ACTIVE;
    let res = contract.try_quorumVotes();
    if (!res.reverted) {
      proposal.quorumVotes = res.value;
    } else {
      proposal.quorumVotes = BIGINT_ONE;
    }

    let governance = getGovernance();
    proposal.tokenHoldersAtStart = governance.currentTokenHolders;
    proposal.delegatesAtStart = governance.currentDelegates;
  }
  return proposal;
}
// VoteCast(account, proposalId, support, weight, reason);
export function handleVoteCast(event: VoteCast): void {
  let proposal = getLatestProposalValues(
    event.params.proposalId.toString(),
    event.address
  );

  // Proposal will be updated as part of handler
  _handleVoteCast(
    proposal,
    event.params.voter.toHexString(),
    event.params.votes,
    event.params.reason,
    event.params.support,
    event
  );
}

// VotingDelaySet(oldVotingDelay,newVotingDelay)
export function handleVotingDelaySet(event: VotingDelaySet): void {
  let governanceFramework = getGovernanceFramework(event.address.toHexString());
  governanceFramework.votingDelay = event.params.newVotingDelay;
  governanceFramework.save();
}

// VotingDelaySet(oldVotingPeriod,newVotingPeriod)
export function handleVotingPeriodSet(event: VotingPeriodSet): void {
  let governanceFramework = getGovernanceFramework(event.address.toHexString());
  governanceFramework.votingPeriod = event.params.newVotingPeriod;
  governanceFramework.save();
}

// Helper function that imports and binds the contract
function getGovernanceFramework(contractAddress: string): GovernanceFramework {
  let governanceFramework = GovernanceFramework.load(contractAddress);

  if (!governanceFramework) {
    governanceFramework = new GovernanceFramework(contractAddress);
    let contract = GovernorBravoDelegate.bind(
      Address.fromString(contractAddress)
    );

    governanceFramework.name = contract.name();
    governanceFramework.type = GovernanceFrameworkType.GOVERNOR_BRAVO;
    governanceFramework.version = NA;

    governanceFramework.contractAddress = contractAddress;
    governanceFramework.tokenAddress = contract.comp().toHexString();
    governanceFramework.timelockAddress = contract.timelock().toHexString();

    governanceFramework.votingDelay = contract.votingDelay();
    governanceFramework.votingPeriod = contract.votingPeriod();
    governanceFramework.proposalThreshold = contract.proposalThreshold();
    governanceFramework.quorumVotes = contract.quorumVotes();
  }

  return governanceFramework;
}
