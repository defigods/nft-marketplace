//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract PIXLandmark is ERC721Enumerable, Ownable {
    using SafeERC20 for IERC20;

    event Requested(address indexed account);

    enum PIXCategory {
        Legendary,
        Rare,
        Uncommon,
        Common,
        Outliers
    }

    struct LandmarkInfo {
        uint256[] pixTokenIds;
        PIXCategory category;
    }

    string private _baseURIExtended;

    mapping(address => bool) public moderators;
    mapping(uint256 => LandmarkInfo) public landmarks;

    modifier onlyMod() {
        require(moderators[msg.sender], "Caller is not moderator");
        _;
    }

    constructor() ERC721("PIX Landmark", "PIXLand") {
        moderators[msg.sender] = true;
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Moderator cannot be zero address");
        moderators[moderator] = approved;
    }

    function safeMint(address to, LandmarkInfo memory info) external onlyMod {
        _safeMint(to, info);
    }

    function batchMint(address to, LandmarkInfo[] memory infos)
        external
        onlyMod
    {
        require(
            infos.length > 0 && infos.length <= 50,
            "Invalid landmarks length"
        );

        for (uint256 i = 0; i < infos.length; i += 1) {
            _safeMint(to, infos[i]);
        }
    }

    function _safeMint(address to, LandmarkInfo memory info) internal {
        require(info.pixTokenIds.length > 0, "Invalid landmark info");

        uint256 tokenId = totalSupply() + 1;
        _safeMint(to, tokenId);
        landmarks[tokenId] = info;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}
