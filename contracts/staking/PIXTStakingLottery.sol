// solhint-disable not-rely-on-time
//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

contract PIXTStakingLottery is OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    IERC20Upgradeable public pixToken;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public earned;

    uint256 public lastLotteryTime;
    uint256 public rewardPerBlock;
    uint256 public period;

    mapping(address => bool) public moderators;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event SetReward(address indexed user, uint256 reward);

    modifier onlyMod() {
        require(moderators[msg.sender], "PIXTStakingLottery: NON_MODERATOR");
        _;
    }

    function initialize(
        address token,
        uint256 _rewardPerBlock,
        uint256 _period
    ) external initializer {
        require(token != address(0), "PIXTStakingLottery: INVALID_PIXT");
        pixToken = IERC20Upgradeable(token);
        rewardPerBlock = _rewardPerBlock;
        period = _period;
        __Ownable_init();

        moderators[msg.sender] = true;
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "PIXTStakingLottery: INVALID_MODERATOR");
        moderators[moderator] = approved;
    }

    /**
     * @dev stake some amount of staking token
     * @param amount staking token amount(>0) to stakes
     * @notice emit {Staked} event
     */
    function stake(uint256 amount) external {
        require(amount > 0, "PIXTStakingLottery: ZERO_AMOUNT");
        totalStaked += amount;
        stakedAmounts[msg.sender] += amount;
        pixToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    function startLottery() external onlyMod {
        lastLotteryTime = block.timestamp;
    }

    function setRewardPerBlock(uint256 _amount) external onlyOwner {
        rewardPerBlock = _amount;
    }

    /**
     * @dev unstake partial staked amount
     * @param amount staking token amount(>0) to unstake
     * @notice emit {Unstaked} event
     */
    function unstake(uint256 amount) external {
        require(amount > 0, "PIXTStakingLottery: ZERO_AMOUNT");
        require(stakedAmounts[msg.sender] >= amount, "PIXTStakingLottery: NO_WITHDRAWALS");
        totalStaked -= amount;
        stakedAmounts[msg.sender] -= amount;
        pixToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /**
     * @dev claim reward and update reward related arguments
     * @notice emit {RewardPaid} event
     */
    function claim() external {
        require(earned[msg.sender] > 0, "PIXTStakingLottery: NO_WITHDRAWALS");

        pixToken.safeTransfer(msg.sender, earned[msg.sender]);
        earned[msg.sender] = 0;
        emit RewardPaid(msg.sender, earned[msg.sender]);
    }

    function setPeriod(uint256 _period) external onlyOwner {
        period = _period;
    }

    function setReward(address _winner) external onlyMod {
        require(block.timestamp - lastLotteryTime >= period, "PIXTStakingLottery: WINNER_SET");

        require(stakedAmounts[_winner] > 0, "PIXTStakingLottery: NO_STAKES");
        uint256 pending = _calculateReward();
        require(pending > 0, "PIXTStakingLottery: NO_PENDING");
        earned[_winner] += pending;
        lastLotteryTime = block.timestamp;

        emit SetReward(_winner, pending);
    }

    function _calculateReward() internal view returns (uint256) {
        uint256 blocksPassed = block.timestamp.sub(lastLotteryTime);
        return rewardPerBlock.mul(blocksPassed);
    }
}
