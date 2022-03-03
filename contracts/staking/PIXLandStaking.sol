//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

contract PIXLandStaking is OwnableUpgradeable, ERC1155HolderUpgradeable {
    using SafeMathUpgradeable for uint256;

    event StakedPixLandNFT(address indexed account, uint256 tokenId, uint256 amount);
    event WithdrawnPixLandNFT(address indexed account, uint256 tokenId, uint256 amount);
    event ClaimPixLandNFT(address indexed account, uint256 pending);

    struct UserInfo {
        mapping(uint256 => uint256) stakedAmount;
        uint256 rewardDebt;
        uint256 tiers;
    }

    mapping(address => UserInfo) public userInfo;
    mapping(uint256 => uint256) public tierInfo;

    IERC20Upgradeable public rewardToken;

    address public pixLandmark;
    uint256 public lastUpdateBlock;
    uint256 public rewardPerBlock;
    uint256 public totalTiers;
    uint256 public accPixLandNFTPerShare;
    uint256 constant ACC_PIX_PRECISION = 1e12;

    modifier updateRewardPool() {
        if (totalTiers > 0) {
            uint256 reward = _calculateReward();
            accPixLandNFTPerShare = accPixLandNFTPerShare.add(
                reward.mul(ACC_PIX_PRECISION).div(totalTiers)
            );
        }
        lastUpdateBlock = block.number;
        _;
    }

    function initialize(
        address _pixt,
        address _pixLandmark,
        uint256 _rewardPerBlock
    ) external initializer {
        require(_pixt != address(0), "LandStaking: INVALID_PIXT");
        require(_pixLandmark != address(0), "LandStaking: INVALID_PIX_LAND");
        rewardToken = IERC20Upgradeable(_pixt);
        pixLandmark = _pixLandmark;
        rewardPerBlock = _rewardPerBlock;
        __Ownable_init();
        __ERC1155Holder_init();
    }

    function stake(uint256 _tokenId, uint256 _amount) external updateRewardPool {
        require(_tokenId > 0, "LandStaking: INVALID_TOKEN_ID");
        require(_amount > 0, "LandStaking: INVALID_AMOUNT");
        require(tierInfo[_tokenId] > 0, "LandStaking: INVALID_TIER");

        UserInfo storage user = userInfo[msg.sender];

        uint256 tiers = tierInfo[_tokenId];

        if (user.tiers > 0) {
            uint256 pending = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION).sub(
                user.rewardDebt
            );
            rewardToken.transfer(msg.sender, pending);
        }

        IERC1155Upgradeable(pixLandmark).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId,
            _amount,
            ""
        );
        totalTiers = totalTiers.add(tiers);

        // Update User Info
        user.tiers = user.tiers.add(tiers);
        user.rewardDebt = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION);
        user.stakedAmount[_tokenId] += _amount;

        emit StakedPixLandNFT(msg.sender, _tokenId, _amount);
    }

    function withdraw(uint256 _tokenId, uint256 _amount) external updateRewardPool {
        require(_tokenId > 0, "LandStaking: INVALID_TOKEN_ID");
        require(_amount > 0, "LandStaking: INVALID_AMOUNT");
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "LandStaking: NO_WITHDRAWALS");

        uint256 pending = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION).sub(
            user.rewardDebt
        );
        rewardToken.transfer(msg.sender, pending);

        IERC1155Upgradeable(pixLandmark).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId,
            _amount,
            ""
        );
        totalTiers = totalTiers.sub(tierInfo[_tokenId]);
        // Update UserInfo
        user.tiers = user.tiers.sub(tierInfo[_tokenId]);
        user.rewardDebt = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION);
        user.stakedAmount[_tokenId] -= _amount;

        emit WithdrawnPixLandNFT(msg.sender, _tokenId, _amount);
    }

    function claim() external updateRewardPool {
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "LandStaking: NO_WITHDRAWALS");

        uint256 pending = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION).sub(
            user.rewardDebt
        );
        if (pending > 0) {
            rewardToken.transfer(msg.sender, pending);
            emit ClaimPixLandNFT(msg.sender, pending);
        }
        // Update UserInfo
        user.rewardDebt = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION);
    }

    function setRewardPerBlock(uint256 _amount) external onlyOwner {
        rewardPerBlock = _amount;
    }

    function setTierInfo(uint256 _tokenId, uint256 _tiers) external onlyOwner {
        require(_tiers > 0, "LandStaking: INVALID_TIERS");
        tierInfo[_tokenId] = _tiers;
    }

    function _calculateReward() internal view returns (uint256) {
        uint256 blocksPassed = block.number.sub(lastUpdateBlock);
        return rewardPerBlock.mul(blocksPassed);
    }
}
