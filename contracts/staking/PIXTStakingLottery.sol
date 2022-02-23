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

    uint256 public lastUpdateBlock;
    uint256 public rewardRate;
    uint256 public rewardPerTokenStored;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);

    function initialize(address token) external initializer {
        require(token != address(0), "Staking: INVALID_PIXT");
        pixToken = IERC20Upgradeable(token);
        __Ownable_init();
    }

    /**
     * @dev stake some amount of staking token
     * @param amount staking token amount(>0) to stakes
     * @notice emit {Staked} event
     */
    function stake(uint256 amount) public {
        require(amount > 0, "Staking: STAKE_ZERO");
        totalStaked += amount;
        stakedAmounts[msg.sender] += amount;
        pixToken.safeTransferFrom(msg.sender, address(this), amount);
        if (lastUpdateBlock == 0) {
            lastUpdateBlock = block.number;
        }
        emit Staked(msg.sender, amount);
    }

    /**
     * @dev unstake partial staked amount
     * @param amount staking token amount(>0) to unstake
     * @notice emit {Unstaked} event
     */
    function unstake(uint256 amount) public {
        require(amount > 0, "Staking: UNSTAKE_ZERO");
        totalStaked -= amount;
        stakedAmounts[msg.sender] -= amount;
        pixToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /**
     * @dev claim reward and update reward related arguments
     * @notice emit {RewardPaid} event
     */
    function claim(address _winner) public onlyOwner {
        uint256 reward = _calculateReward();
        if (reward > 0) {
            pixToken.safeTransfer(_winner, reward);
            lastUpdateBlock = block.number;
            emit RewardPaid(_winner, reward);
        }
    }

    function setReward(address _winner) external onlyOwner {
        uint256 pending = _calculateReward();
        require(pending > 0, "setReward: no tokens to set");
        if (pending > 0) {
            earned[_winner] += pending;
        }
    }

    function _calculateReward() internal view returns (uint256) {
        uint256 blocksPassed = block.number.sub(lastUpdateBlock);
        return rewardRate.mul(blocksPassed);
    }
}
