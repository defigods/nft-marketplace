//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract PIXLandStaking is
    OwnableUpgradeable,
    ERC1155HolderUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event PIXLandStaked(address indexed account, uint256 tokenId, uint256 amount);
    event PIXLandUnstaked(address indexed account, uint256 tokenId, uint256 amount);
    event RewardClaimed(address indexed account, uint256 reward);

    address public pixLandmark;
    address public moderator;

    IERC20Upgradeable public rewardToken;

    mapping(uint256 => address[]) public stakers;
    mapping(address => uint256[]) public stakedIDs;
    mapping(address => mapping(uint256 => uint256)) public stakedAmounts;
    mapping(address => mapping(uint256 => uint256)) public rewards;

    function initialize(address _pixt, address _pixLandmark) external initializer {
        require(_pixt != address(0), "LandStaking: INVALID_PIXT");
        require(_pixLandmark != address(0), "LandStaking: INVALID_PIX_LAND");

        __Ownable_init();
        __ERC1155Holder_init();
        __ReentrancyGuard_init();

        rewardToken = IERC20Upgradeable(_pixt);
        pixLandmark = _pixLandmark;
    }

    function setModerator(address moderator_) external onlyOwner {
        moderator = moderator_;
    }

    function earnedBatch(address account, uint256[] calldata tokenIds)
        public
        view
        returns (uint256[] memory)
    {
        uint256[] memory earneds = new uint256[](tokenIds.length);
        for (uint256 i; i < tokenIds.length; i += 1) {
            earneds[i] = rewards[account][tokenIds[i]];
        }
        return earneds;
    }

    function earnedByAccount(address account) public view returns (uint256 reward) {
        for (uint256 i; i < stakedIDs[account].length; i += 1) {
            if (stakedAmounts[account][stakedIDs[account][i]] == 0) continue;
            reward += rewards[account][stakedIDs[account][i]];
        }
    }

    function stake(uint256 tokenId, uint256 amount) external nonReentrant {
        stakers[tokenId].push(msg.sender);
        stakedIDs[msg.sender].push(tokenId);
        stakedAmounts[msg.sender][tokenId] += amount;
        IERC1155Upgradeable(pixLandmark).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            amount,
            ""
        );

        emit PIXLandStaked(msg.sender, tokenId, amount);
    }

    function unstake(uint256 tokenId, uint256 amount) external nonReentrant {
        require(stakedAmounts[msg.sender][tokenId] >= amount, "LandStaking: NOT_ENOUGH");

        uint256 reward = rewards[msg.sender][tokenId];
        if (reward > 0) {
            rewards[msg.sender][tokenId] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }

        stakedAmounts[msg.sender][tokenId] -= amount;
        IERC1155Upgradeable(pixLandmark).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId,
            amount,
            ""
        );

        emit PIXLandUnstaked(msg.sender, tokenId, amount);
    }

    function claimBatch(uint256[] memory tokenIds) public {
        uint256 reward;
        for (uint256 i; i < tokenIds.length; i += 1) {
            reward += rewards[msg.sender][tokenIds[i]];
            rewards[msg.sender][tokenIds[i]] = 0;
        }
        if (reward > 0) {
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function claim() external {
        uint256 count;
        for (uint256 i; i < stakedIDs[msg.sender].length; i += 1) {
            if (stakedAmounts[msg.sender][stakedIDs[msg.sender][i]] == 0) continue;
            count++;
        }
        uint256 k;
        uint256[] memory tokenIds = new uint256[](count);
        for (uint256 i; i < stakedIDs[msg.sender].length; i += 1) {
            if (stakedAmounts[msg.sender][stakedIDs[msg.sender][i]] == 0) continue;
            tokenIds[k++] = stakedIDs[msg.sender][i];
        }
        claimBatch(tokenIds);
    }

    function addReward(
        address[] calldata accounts_,
        uint256[] calldata ids_,
        uint256[] calldata rewards_
    ) external {
        require(msg.sender == moderator || msg.sender == owner(), "LandStaking: NOT_MODERATOR");
        require(
            accounts_.length == ids_.length && accounts_.length == rewards_.length,
            "LandStaking: INVALID_ARGUMENTS"
        );

        for (uint256 i; i < accounts_.length; i += 1) rewards[accounts_[i]][ids_[i]] += rewards_[i];
    }

    function isStaked(address account, uint256 tokenId) external view returns (bool) {
        return stakedAmounts[account][tokenId] > 0;
    }

    function stakersForId(uint256 tokenId) external view returns (address[] memory) {
        uint256 count;
        for (uint256 i; i < stakers[tokenId].length; i += 1) {
            if (stakedAmounts[stakers[tokenId][i]][tokenId] == 0) continue;
            count++;
        }
        uint256 k;
        address[] memory users = new address[](count);
        for (uint256 i; i < stakers[tokenId].length; i += 1) {
            if (stakedAmounts[stakers[tokenId][i]][tokenId] == 0) continue;
            users[k++] = stakers[tokenId][i];
        }
        return users;
    }
}
