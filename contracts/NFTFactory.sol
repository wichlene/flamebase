// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FlameNFT {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    uint256 public maxSupply;
    uint256 public mintPrice;
    address public creator;
    string public baseURI;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(string memory _name, string memory _symbol, uint256 _maxSupply, uint256 _mintPrice, string memory _baseURI, address _creator) {
        name = _name; symbol = _symbol; maxSupply = _maxSupply; mintPrice = _mintPrice; baseURI = _baseURI; creator = _creator;
    }

    function mint() external payable returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient ETH");
        require(totalSupply < maxSupply, "Sold out");
        uint256 tokenId = totalSupply++;
        ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender]++;
        (bool s,) = creator.call{value: msg.value}(""); require(s);
        emit Transfer(address(0), msg.sender, tokenId);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) { digits -= 1; buffer[digits] = bytes1(uint8(48 + uint256(value % 10))); value /= 10; }
        return string(buffer);
    }
}

contract NFTFactory {
    address public owner;
    uint256 public constant DEPLOY_FEE = 0.001 ether;
    struct NFTInfo { address addr; string name; string symbol; address creator; uint256 maxSupply; uint256 mintPrice; }
    NFTInfo[] public collections;
    event NFTDeployed(address indexed creator, address nft, string name, uint256 maxSupply, uint256 mintPrice);

    constructor() { owner = msg.sender; }

    function deployNFT(string memory _name, string memory _symbol, uint256 _maxSupply, uint256 _mintPrice, string memory _baseURI) external payable returns (address) {
        require(msg.value >= DEPLOY_FEE, "Fee required");
        require(bytes(_name).length > 0, "Invalid name");
        require(_maxSupply > 0 && _maxSupply <= 10000, "Max 10000 supply");
        FlameNFT nft = new FlameNFT(_name, _symbol, _maxSupply, _mintPrice, _baseURI, msg.sender);
        collections.push(NFTInfo(address(nft), _name, _symbol, msg.sender, _maxSupply, _mintPrice));
        (bool s,) = owner.call{value: msg.value}(""); require(s);
        emit NFTDeployed(msg.sender, address(nft), _name, _maxSupply, _mintPrice);
        return address(nft);
    }

    function getCollections() external view returns (NFTInfo[] memory) { return collections; }
    function collectionCount() external view returns (uint256) { return collections.length; }
}
