// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FlameBaseTools {
    address public owner;

    uint256 public globalCounter;
    mapping(address => uint256) public userCounters;

    mapping(address => uint256) public lastCheckin;
    mapping(address => uint256) public streakDays;
    mapping(address => uint256) public maxStreak;

    struct LogEntry { string text; uint256 timestamp; }
    mapping(address => LogEntry[]) private userLogs;

    mapping(address => string) public greetings;

    event Counted(address indexed user, uint256 globalCount, uint256 userCount);
    event CheckedIn(address indexed user, uint256 streak);
    event Logged(address indexed user, string text);
    event Greeted(address indexed user, string greeting);

    constructor() { owner = msg.sender; }

    function _forwardFee() internal {
        if (msg.value > 0) {
            (bool s,) = owner.call{value: msg.value}("");
            require(s, "Transfer failed");
        }
    }

    function count() external payable {
        _forwardFee();
        globalCounter++;
        userCounters[msg.sender]++;
        emit Counted(msg.sender, globalCounter, userCounters[msg.sender]);
    }

    function checkIn() external payable {
        _forwardFee();
        uint256 todayDay = block.timestamp / 1 days;
        uint256 lastDay = lastCheckin[msg.sender] / 1 days;
        if (lastCheckin[msg.sender] == 0) {
            streakDays[msg.sender] = 1;
        } else if (todayDay == lastDay + 1) {
            streakDays[msg.sender]++;
        } else if (todayDay > lastDay + 1) {
            streakDays[msg.sender] = 1;
        }
        if (streakDays[msg.sender] > maxStreak[msg.sender]) {
            maxStreak[msg.sender] = streakDays[msg.sender];
        }
        lastCheckin[msg.sender] = block.timestamp;
        emit CheckedIn(msg.sender, streakDays[msg.sender]);
    }

    function log(string memory _text) external payable {
        _forwardFee();
        require(bytes(_text).length > 0 && bytes(_text).length <= 280, "1-280 chars");
        userLogs[msg.sender].push(LogEntry(_text, block.timestamp));
        emit Logged(msg.sender, _text);
    }

    function greet(string memory _greeting) external payable {
        _forwardFee();
        require(bytes(_greeting).length <= 100, "Max 100 chars");
        greetings[msg.sender] = _greeting;
        emit Greeted(msg.sender, _greeting);
    }

    function getLogs(address user) external view returns (LogEntry[] memory) {
        return userLogs[user];
    }

    function canCheckInToday(address user) external view returns (bool) {
        if (lastCheckin[user] == 0) return true;
        return block.timestamp / 1 days > lastCheckin[user] / 1 days;
    }
}
