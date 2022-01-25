//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

contract PIXLandStaking is OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    event StakedPixLandNFT(uint256 tokenId, address indexed recipient);
    event WithdrawnPixLandNFT(uint256 tokenId, address indexed recipient);
    event ClaimPixLandNFT(uint256 pending, address indexed recipient);

    struct UserInfo {
        mapping(uint256 => bool) isStaked;
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
        require(_pixt != address(0), "Staking: INVALID_PIXT");
        require(_pixLandmark != address(0), "Staking: INVALID_PIX_LAND");
        rewardToken = IERC20Upgradeable(_pixt);
        pixLandmark = _pixLandmark;
        rewardPerBlock = _rewardPerBlock;
        __Ownable_init();
    }

    function stake(uint256 _tokenId) external updateRewardPool {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        require(tierInfo[_tokenId] > 0, "Staking: INVALID_TIER");

        UserInfo storage user = userInfo[msg.sender];

        uint256 tiers = tierInfo[_tokenId];

        if (user.tiers > 0) {
            uint256 pending = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION).sub(
                user.rewardDebt
            );
            rewardToken.transfer(msg.sender, pending);
        }

        IERC721Upgradeable(pixLandmark).transferFrom(msg.sender, address(this), _tokenId);
        totalTiers = totalTiers.add(tiers);

        // Update User Info
        user.tiers = user.tiers.add(tiers);
        user.rewardDebt = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION);
        user.isStaked[_tokenId] = true;

        emit StakedPixLandNFT(_tokenId, address(this));
    }

    function withdraw(uint256 _tokenId) external updateRewardPool {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "Staking: NO_WITHDRAWALS");
        require(user.isStaked[_tokenId], "Staking: NO_STAKES");

        uint256 pending = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION).sub(
            user.rewardDebt
        );
        rewardToken.transfer(msg.sender, pending);

        IERC721Upgradeable(pixLandmark).transferFrom(address(this), msg.sender, _tokenId);
        totalTiers = totalTiers.sub(tierInfo[_tokenId]);
        // Update UserInfo
        user.tiers = user.tiers.sub(tierInfo[_tokenId]);
        user.rewardDebt = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION);
        user.isStaked[_tokenId] = false;

        emit WithdrawnPixLandNFT(_tokenId, msg.sender);
    }

    function claim() external updateRewardPool {
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "Staking: NO_WITHDRAWALS");

        uint256 pending = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION).sub(
            user.rewardDebt
        );
        if (pending > 0) {
            rewardToken.transfer(msg.sender, pending);
            emit ClaimPixLandNFT(pending, msg.sender);
        }
        // Update UserInfo
        user.rewardDebt = user.tiers.mul(accPixLandNFTPerShare).div(ACC_PIX_PRECISION);
    }

    function setRewardPerBlock(uint256 _amount) external onlyOwner {
        rewardPerBlock = _amount;
    }

    function setTierInfo(uint256 _tokenId, uint256 _tiers) external onlyOwner {
        require(_tiers > 0, "Staking: INVALID_TIERS");

        tierInfo[_tokenId] = _tiers;
    }

    function _calculateReward() internal view returns (uint256) {
        uint256 blocksPassed = block.number.sub(lastUpdateBlock);
        return rewardPerBlock.mul(blocksPassed);
    }
}
