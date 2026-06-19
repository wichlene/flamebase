// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FlameFollow
/// @notice On-chain social graph for FlameBase. Following another address is a
///         real transaction recorded on Base — no off-chain database, no
///         localStorage. Anyone can read who follows whom directly from chain.
contract FlameFollow {
    address public owner;

    // follower => target => isFollowing
    mapping(address => mapping(address => bool)) public isFollowing;

    // Enumerable following list per user, maintained with swap-and-pop so
    // getFollowing() can return the full list in a single call for the UI.
    mapping(address => address[]) private _following;
    // 1-based index of `target` within _following[follower]; 0 means absent.
    mapping(address => mapping(address => uint256)) private _followingIndex;

    // How many accounts follow `user`.
    mapping(address => uint256) public followerCount;

    event Followed(address indexed follower, address indexed target);
    event Unfollowed(address indexed follower, address indexed target);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Follow `target`. Any ETH sent is forwarded to the owner as an
    ///         optional platform fee (the contract never requires a minimum).
    function follow(address target) external payable {
        require(target != address(0) && target != msg.sender, "Invalid target");
        require(!isFollowing[msg.sender][target], "Already following");

        isFollowing[msg.sender][target] = true;
        _following[msg.sender].push(target);
        _followingIndex[msg.sender][target] = _following[msg.sender].length;
        followerCount[target]++;

        if (msg.value > 0) {
            (bool s, ) = owner.call{value: msg.value}("");
            require(s, "Fee transfer failed");
        }
        emit Followed(msg.sender, target);
    }

    /// @notice Unfollow `target`.
    function unfollow(address target) external payable {
        require(isFollowing[msg.sender][target], "Not following");

        isFollowing[msg.sender][target] = false;

        uint256 idx = _followingIndex[msg.sender][target]; // 1-based
        uint256 lastIdx = _following[msg.sender].length;
        if (idx != lastIdx) {
            address last = _following[msg.sender][lastIdx - 1];
            _following[msg.sender][idx - 1] = last;
            _followingIndex[msg.sender][last] = idx;
        }
        _following[msg.sender].pop();
        _followingIndex[msg.sender][target] = 0;
        followerCount[target]--;

        if (msg.value > 0) {
            (bool s, ) = owner.call{value: msg.value}("");
            require(s, "Fee transfer failed");
        }
        emit Unfollowed(msg.sender, target);
    }

    /// @notice Full list of accounts `user` follows.
    function getFollowing(address user) external view returns (address[] memory) {
        return _following[user];
    }

    /// @notice How many accounts `user` follows.
    function followingCount(address user) external view returns (uint256) {
        return _following[user].length;
    }
}
