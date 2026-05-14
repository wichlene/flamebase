// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FlameBase {
    address public owner;

    uint256 public likePrice = 0.0001 ether;
    uint256 public commentPrice = 0.0003 ether;
    uint256 public photoPrice = 0.0005 ether;

    struct Profile {
        string username;
        string ipfsHash;
        bool exists;
        uint256 flames;
    }

    struct Comment {
        address commenter;
        string text;
        uint256 timestamp;
    }

    mapping(address => Profile) public profiles;
    mapping(address => address[]) public likes;
    mapping(address => Comment[]) public comments;

    event ProfileCreated(address indexed user, string username);
    event Liked(address indexed from, address indexed to, uint256 amount);
    event Commented(address indexed from, address indexed to, string text);
    event PhotoUploaded(address indexed user, string ipfsHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createProfile(string memory _username, string memory _ipfsHash) external {
        require(!profiles[msg.sender].exists, "Profile exists");
        profiles[msg.sender] = Profile(_username, _ipfsHash, true, 0);
        emit ProfileCreated(msg.sender, _username);
    }

    function like(address _to) external payable {
        require(msg.value >= likePrice, "Insufficient fee");
        require(profiles[_to].exists, "Profile not found");
        likes[_to].push(msg.sender);
        profiles[_to].flames += 1;
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit Liked(msg.sender, _to, msg.value);
    }

    function comment(address _to, string memory _text) external payable {
        require(msg.value >= commentPrice, "Insufficient fee");
        require(profiles[_to].exists, "Profile not found");
        comments[_to].push(Comment(msg.sender, _text, block.timestamp));
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit Commented(msg.sender, _to, _text);
    }

    function uploadPhoto(string memory _ipfsHash) external payable {
        require(msg.value >= photoPrice, "Insufficient fee");
        require(profiles[msg.sender].exists, "Create profile first");
        profiles[msg.sender].ipfsHash = _ipfsHash;
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit PhotoUploaded(msg.sender, _ipfsHash);
    }

    function setLikePrice(uint256 _price) external onlyOwner {
        likePrice = _price;
    }

    function setCommentPrice(uint256 _price) external onlyOwner {
        commentPrice = _price;
    }

    function setPhotoPrice(uint256 _price) external onlyOwner {
        photoPrice = _price;
    }

    function getLikes(address _user) external view returns (address[] memory) {
        return likes[_user];
    }

    function getComments(address _user) external view returns (Comment[] memory) {
        return comments[_user];
    }
}