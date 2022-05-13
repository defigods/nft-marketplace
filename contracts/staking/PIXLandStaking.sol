//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract PIXLandStaking is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event PIXLandStaked(uint256 tokenId, address indexed account);
    event PIXLandUnstaked(uint256 tokenId, address indexed account);
    event RewardClaimed(uint256 reward, address indexed account);

    address public pixLandmark;
    address public moderator;

    IERC20Upgradeable public rewardToken;
    mapping(address => mapping(uint256 => uint256)) public stakeAmounts;
    mapping(address => uint256) public rewards;

    function initialize(address _pixt, address _pixLandmark) external initializer {
        require(_pixt != address(0), "LandStaking: INVALID_PIXT");
        require(_pixLandmark != address(0), "LandStaking: INVALID_PIX_LAND");

        __Ownable_init();
        __ReentrancyGuard_init();

        rewardToken = IERC20Upgradeable(_pixt);
        pixLandmark = _pixLandmark;
    }

    function setModerator(address moderator_) external onlyOwner {
        moderator = moderator_;
    }

    function stake(uint256 tokenId, uint256 amount) external nonReentrant {
        require(tokenId > 0, "LandStaking: INVALID_TOKEN_ID");

        stakeAmounts[msg.sender][tokenId] += amount;
        IERC1155Upgradeable(pixLandmark).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            amount,
            ""
        );

        emit PIXLandStaked(tokenId, address(this));
    }

    function unstake(uint256 tokenId, uint256 amount) external nonReentrant {
        require(tokenId > 0, "LandStaking: INVALID_TOKEN_ID");
        require(stakeAmounts[msg.sender][tokenId] >= amount, "LandStaking: NOT_STAKER");

        stakeAmounts[msg.sender][tokenId] -= amount;
        IERC1155Upgradeable(pixLandmark).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId,
            amount,
            ""
        );

        emit PIXLandUnstaked(tokenId, msg.sender);
    }

    /**
     * @dev claim reward and update reward related arguments
     * @notice emit {RewardClaimed} event
     */
    function claim() public {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(reward, msg.sender);
        }
    }

    function addReward(address account, uint256 reward) external {
        require(msg.sender == moderator || msg.sender == owner(), "LandStaking: NOT_MODERATOR");
        rewards[account] += reward;
    }

    function isStaked(address account, uint256 tokenId) external view returns (bool) {
        return stakeAmounts[account][tokenId] > 0;
    }
}
