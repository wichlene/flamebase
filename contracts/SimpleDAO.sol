// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleDAO {
    address public owner;
    uint256 public constant PROPOSE_FEE = 0.001 ether;
    uint256 public constant VOTE_FEE = 0.0001 ether;
    uint256 public constant VOTE_DURATION = 3 days;

    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 deadline;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, address indexed proposer, string title);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support);

    constructor() { owner = msg.sender; }

    function propose(string memory _title, string memory _description) external payable returns (uint256) {
        require(msg.value >= PROPOSE_FEE, "Fee required");
        require(bytes(_title).length > 0 && bytes(_title).length <= 100, "Title 1-100 chars");
        uint256 id = proposalCount++;
        proposals[id] = Proposal(id, msg.sender, _title, _description, 0, 0, block.timestamp + VOTE_DURATION);
        (bool s,) = owner.call{value: msg.value}(""); require(s);
        emit ProposalCreated(id, msg.sender, _title);
        return id;
    }

    function vote(uint256 _id, bool _support) external payable {
        require(msg.value >= VOTE_FEE, "Fee required");
        require(_id < proposalCount, "Not found");
        require(!hasVoted[_id][msg.sender], "Already voted");
        require(block.timestamp < proposals[_id].deadline, "Voting ended");
        hasVoted[_id][msg.sender] = true;
        if (_support) proposals[_id].votesFor++;
        else proposals[_id].votesAgainst++;
        (bool s,) = owner.call{value: msg.value}(""); require(s);
        emit Voted(_id, msg.sender, _support);
    }

    function getProposal(uint256 _id) external view returns (Proposal memory) { return proposals[_id]; }
    function isActive(uint256 _id) external view returns (bool) { return block.timestamp < proposals[_id].deadline; }
}
