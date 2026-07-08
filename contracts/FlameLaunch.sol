// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*//////////////////////////////////////////////////////////////////////////
    FlameLaunch — an on-site bonding-curve launchpad for FlameBase.

    WHAT IT IS
    Anyone can launch a token from FlameBase and it is immediately BUYABLE and
    SELLABLE on the site — no Uniswap pool, no upfront liquidity from the
    creator. The launchpad itself is the market maker: a constant-product
    bonding curve (pump.fun style) with a *virtual* ETH reserve so the first
    buy has a sane starting price and the price rises smoothly as people buy.
    When a token's curve has collected `GRADUATION_ETH` of real ETH it
    "graduates": the curve locks and the collected ETH + the reserved token
    allocation are handed to a real DEX pool (migration is deliberately a
    separate, admin-guarded step — see `graduate()`).

    STATUS — DRAFT, NOT YET DEPLOYED.
    This contract custodies user ETH. It MUST be (1) unit-tested, (2) run
    end-to-end on Base Sepolia, and (3) independently audited BEFORE it holds
    a single wei of real money. Do not deploy to mainnet from this file as-is.

    TOKEN STANDARD
    The curve logic is token-standard-agnostic. This draft launches a minimal
    self-contained ERC-20 (`FlameLaunchToken`) so the engine compiles and can
    be tested today. Once Base activates B20, the ONLY change is swapping
    `_deployToken()` to call the B20 factory precompile — the curve, fees,
    and graduation stay identical. B20 gives every launched token native,
    everywhere-visible ERC-20 behavior with no extra work.
//////////////////////////////////////////////////////////////////////////*/

/// Minimal ERC-20 the launchpad mints per launch. Full supply is minted to the
/// launchpad at creation; the curve releases it on buys and reclaims it on
/// sells. Transferable like any ERC-20 (holders can move tokens off-curve).
contract FlameLaunchToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable launchpad;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name;
        symbol = _symbol;
        launchpad = msg.sender; // the FlameLaunch contract
        totalSupply = _supply;
        balanceOf[msg.sender] = _supply; // full supply starts on the curve
        emit Transfer(address(0), msg.sender, _supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return _transfer(msg.sender, to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        return _transfer(from, to, value);
    }

    function _transfer(address from, address to, uint256 value) internal returns (bool) {
        require(to != address(0), "to=0");
        uint256 bal = balanceOf[from];
        require(bal >= value, "balance");
        unchecked { balanceOf[from] = bal - value; }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}

contract FlameLaunch {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant TOTAL_SUPPLY   = 1_000_000_000 ether; // 1e9 * 1e18
    uint256 public constant CURVE_SUPPLY   =   800_000_000 ether; // sold on the curve
    uint256 public constant DEX_SUPPLY     =   200_000_000 ether; // reserved for the DEX pool at graduation
    uint256 public constant VIRTUAL_ETH    =            1 ether;  // sets the starting price (not real ETH)
    uint256 public constant GRADUATION_ETH =            4 ether;  // real ETH raised that triggers graduation
    uint256 public constant FEE_BPS        =              100;    // 1% trade fee to `feeTo`
    uint256 private constant BPS           =           10_000;

    // Constant product for every curve: k = VIRTUAL_ETH * CURVE_SUPPLY, fixed.
    uint256 private constant K = VIRTUAL_ETH * CURVE_SUPPLY;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    struct Curve {
        uint256 ethReserve;   // includes VIRTUAL_ETH; realEth = ethReserve - VIRTUAL_ETH
        uint256 tokenReserve; // tokens still purchasable on the curve
        address creator;
        bool graduated;
    }

    address public owner;
    address public feeTo;
    mapping(address => Curve) public curves; // token => curve
    address[] public allTokens;

    // Reentrancy guard.
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Launched(address indexed token, address indexed creator, string name, string symbol);
    event Bought(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee);
    event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee);
    event Graduated(address indexed token, uint256 ethRaised, uint256 dexTokens);
    event OwnerUpdated(address indexed newOwner);
    event FeeToUpdated(address indexed newFeeTo);

    constructor(address _feeTo) {
        owner = msg.sender;
        feeTo = _feeTo == address(0) ? msg.sender : _feeTo;
    }

    /*//////////////////////////////////////////////////////////////
                                 LAUNCH
    //////////////////////////////////////////////////////////////*/

    /// Launch a new token. No upfront liquidity required. Optionally include
    /// ETH to make the very first buy in the same transaction (dev buy).
    function launch(string calldata name_, string calldata symbol_)
        external
        payable
        nonReentrant
        returns (address token)
    {
        token = _deployToken(name_, symbol_);
        curves[token] = Curve({
            ethReserve: VIRTUAL_ETH,
            tokenReserve: CURVE_SUPPLY,
            creator: msg.sender,
            graduated: false
        });
        allTokens.push(token);
        emit Launched(token, msg.sender, name_, symbol_);

        if (msg.value > 0) {
            _buy(token, msg.value, msg.sender);
        }
    }

    /// Deploys the launch token. SWAP POINT for B20: once B20 is active on the
    /// target chain, replace this with a createB20(ASSET, ...) call so launched
    /// tokens are native B20s. The rest of the contract is unchanged.
    function _deployToken(string calldata name_, string calldata symbol_) internal returns (address) {
        FlameLaunchToken t = new FlameLaunchToken(name_, symbol_, TOTAL_SUPPLY);
        return address(t);
    }

    /*//////////////////////////////////////////////////////////////
                                  BUY
    //////////////////////////////////////////////////////////////*/

    /// Buy `token` with ETH. `minTokensOut` is slippage protection.
    function buy(address token, uint256 minTokensOut) external payable nonReentrant {
        require(msg.value > 0, "no ETH");
        uint256 out = _buy(token, msg.value, msg.sender);
        require(out >= minTokensOut, "slippage");
    }

    function _buy(address token, uint256 ethIn, address buyer) internal returns (uint256 tokensOut) {
        Curve storage c = curves[token];
        require(c.creator != address(0), "no such token");
        require(!c.graduated, "graduated");

        // Fee is taken off the ETH going into the curve.
        uint256 fee = (ethIn * FEE_BPS) / BPS;
        uint256 ethForCurve = ethIn - fee;

        // Constant product: tokensOut = tokenReserve - K / (ethReserve + ethForCurve)
        uint256 newEthReserve = c.ethReserve + ethForCurve;
        uint256 newTokenReserve = K / newEthReserve;
        tokensOut = c.tokenReserve - newTokenReserve;
        require(tokensOut > 0, "zero out");

        // EFFECTS (before any external call).
        c.ethReserve = newEthReserve;
        c.tokenReserve = newTokenReserve;

        // INTERACTIONS.
        if (fee > 0) _sendETH(feeTo, fee);
        require(FlameLaunchToken(token).transfer(buyer, tokensOut), "token xfer");

        emit Bought(token, buyer, ethIn, tokensOut, fee);

        // Real ETH raised so far = ethReserve - VIRTUAL_ETH.
        if (c.ethReserve - VIRTUAL_ETH >= GRADUATION_ETH) {
            _graduate(token);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  SELL
    //////////////////////////////////////////////////////////////*/

    /// Sell `amount` of `token` back to the curve for ETH. Caller must approve
    /// this contract for `amount` first. `minEthOut` is slippage protection.
    function sell(address token, uint256 amount, uint256 minEthOut) external nonReentrant {
        require(amount > 0, "no tokens");
        Curve storage c = curves[token];
        require(c.creator != address(0), "no such token");
        require(!c.graduated, "graduated");

        // Constant product: ethOut = ethReserve - K / (tokenReserve + amount)
        uint256 newTokenReserve = c.tokenReserve + amount;
        uint256 newEthReserve = K / newTokenReserve;
        uint256 grossEthOut = c.ethReserve - newEthReserve;

        // Never let the curve pay out virtual ETH — only real ETH is withdrawable.
        require(c.ethReserve - grossEthOut >= VIRTUAL_ETH, "exceeds real ETH");

        uint256 fee = (grossEthOut * FEE_BPS) / BPS;
        uint256 ethOut = grossEthOut - fee;
        require(ethOut >= minEthOut, "slippage");

        // EFFECTS.
        c.ethReserve = newEthReserve;
        c.tokenReserve = newTokenReserve;

        // INTERACTIONS — pull tokens in, then pay ETH out.
        require(
            FlameLaunchToken(token).transferFrom(msg.sender, address(this), amount),
            "token pull"
        );
        if (fee > 0) _sendETH(feeTo, fee);
        _sendETH(msg.sender, ethOut);

        emit Sold(token, msg.sender, amount, ethOut, fee);
    }

    /*//////////////////////////////////////////////////////////////
                               GRADUATION
    //////////////////////////////////////////////////////////////*/

    /// Marks a curve graduated and freezes trading on it. Migrating the raised
    /// ETH + DEX_SUPPLY tokens into a real DEX pool is intentionally left as a
    /// guarded follow-up (owner-driven) rather than an automatic inline call,
    /// so pool creation logic can be added and audited on its own. Auto-called
    /// from `_buy` when the graduation threshold is crossed.
    function _graduate(address token) internal {
        Curve storage c = curves[token];
        c.graduated = true;
        uint256 raised = c.ethReserve - VIRTUAL_ETH;
        emit Graduated(token, raised, DEX_SUPPLY);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// How many tokens a given ETH amount would buy right now (fee included).
    function quoteBuy(address token, uint256 ethIn) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.creator == address(0) || c.graduated) return 0;
        uint256 ethForCurve = ethIn - (ethIn * FEE_BPS) / BPS;
        return c.tokenReserve - K / (c.ethReserve + ethForCurve);
    }

    /// How much ETH selling `amount` tokens would return right now (fee included).
    function quoteSell(address token, uint256 amount) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.creator == address(0) || c.graduated) return 0;
        uint256 grossEthOut = c.ethReserve - K / (c.tokenReserve + amount);
        if (c.ethReserve - grossEthOut < VIRTUAL_ETH) return 0;
        return grossEthOut - (grossEthOut * FEE_BPS) / BPS;
    }

    function tokensCount() external view returns (uint256) {
        return allTokens.length;
    }

    /*//////////////////////////////////////////////////////////////
                                 ADMIN
    //////////////////////////////////////////////////////////////*/

    function setOwner(address n) external onlyOwner {
        require(n != address(0), "0");
        owner = n;
        emit OwnerUpdated(n);
    }

    function setFeeTo(address n) external onlyOwner {
        require(n != address(0), "0");
        feeTo = n;
        emit FeeToUpdated(n);
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    function _sendETH(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH send failed");
    }
}
