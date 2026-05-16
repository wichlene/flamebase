// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FlameBase {
    address public owner;

    uint256 public likePrice = 0.0001 ether;
    uint256 public commentPrice = 0.0003 ether;
    uint256 public photoPrice = 0.0005 ether;
    uint256 public postPrice = 0.0002 ether;

    struct Profile {
        string username;
        string avatarHash;
        bool exists;
        uint256 flames;
        uint256 tips;
    }

    struct Post {
        uint256 id;
        address author;
        string content;
        string ipfsHash;
        uint256 timestamp;
        uint256 likes;
        uint256 tips;
    }

    struct Comment {
        address commenter;
        string text;
        uint256 timestamp;
    }

    uint256 public postCount;

    mapping(address => Profile) public profiles;
    mapping(uint256 => Post) public posts;
    mapping(uint256 => Comment[]) public postComments;
    mapping(uint256 => address[]) public postLikes;

    event ProfileCreated(address indexed user, string username);
    event PostCreated(uint256 indexed postId, address indexed author, string content);
    event Liked(uint256 indexed postId, address indexed from);
    event Commented(uint256 indexed postId, address indexed from, string text);
    event TipSent(uint256 indexed postId, address indexed from, address indexed to, uint256 amount);
    event PhotoUploaded(address indexed user, string ipfsHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createProfile(string memory _username, string memory _avatarHash) external {
        require(!profiles[msg.sender].exists, "Profile exists");
        profiles[msg.sender] = Profile(_username, _avatarHash, true, 0, 0);
        emit ProfileCreated(msg.sender, _username);
    }

    function createPost(string memory _content, string memory _ipfsHash) external payable {
        require(msg.value >= postPrice, "Insufficient fee");
        require(profiles[msg.sender].exists, "Create profile first");
        uint256 postId = postCount++;
        posts[postId] = Post(postId, msg.sender, _content, _ipfsHash, block.timestamp, 0, 0);
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit PostCreated(postId, msg.sender, _content);
    }

    function like(uint256 _postId) external payable {
        require(msg.value >= likePrice, "Insufficient fee");
        require(_postId < postCount, "Post not found");
        posts[_postId].likes++;
        postLikes[_postId].push(msg.sender);
        profiles[posts[_postId].author].flames++;
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit Liked(_postId, msg.sender);
    }

    function comment(uint256 _postId, string memory _text) external payable {
        require(msg.value >= commentPrice, "Insufficient fee");
        require(_postId < postCount, "Post not found");
        postComments[_postId].push(Comment(msg.sender, _text, block.timestamp));
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit Commented(_postId, msg.sender, _text);
    }

    function tip(uint256 _postId) external payable {
        require(msg.value > 0, "Send some ETH");
        require(_postId < postCount, "Post not found");
        address author = posts[_postId].author;
        posts[_postId].tips += msg.value;
        profiles[author].tips += msg.value;
        uint256 ownerCut = msg.value / 10;
        uint256 authorAmount = msg.value - ownerCut;
        (bool s1, ) = owner.call{value: ownerCut}("");
        (bool s2, ) = author.call{value: authorAmount}("");
        require(s1 && s2, "Transfer failed");
        emit TipSent(_postId, msg.sender, author, msg.value);
    }

    function uploadAvatar(string memory _ipfsHash) external payable {
        require(msg.value >= photoPrice, "Insufficient fee");
        require(profiles[msg.sender].exists, "Create profile first");
        profiles[msg.sender].avatarHash = _ipfsHash;
        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit PhotoUploaded(msg.sender, _ipfsHash);
    }

    function setPostPrice(uint256 _price) external onlyOwner { postPrice = _price; }
    function setLikePrice(uint256 _price) external onlyOwner { likePrice = _price; }
    function setCommentPrice(uint256 _price) external onlyOwner { commentPrice = _price; }
    function setPhotoPrice(uint256 _price) external onlyOwner { photoPrice = _price; }

    function getPost(uint256 _postId) external view returns (Post memory) {
        return posts[_postId];
    }

    function getPostComments(uint256 _postId) external view returns (Comment[] memory) {
        return postComments[_postId];
    }

    function getPostLikes(uint256 _postId) external view returns (address[] memory) {
        return postLikes[_postId];
    }
}
