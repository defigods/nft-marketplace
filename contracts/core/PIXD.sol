//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";

import "../interfaces/IPIXD.sol";

contract PIXD is IPIXD, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    string private constant _name = "PlanetIX Drones";
    string private constant _symbol = "IXD";
    string private constant _baseTokenURI = "https://planetix.com/";

    mapping(address => bool) public moderators;

    function initialize() public initializer {
        __ERC721Enumerable_init();
        __ERC721_init(_name, _symbol);
        __Ownable_init();

        moderators[msg.sender] = true;
        emit ModeratorUpdated(msg.sender, true);
    }

    modifier onlyMod() {
        require(moderators[msg.sender], "PixD: NON_MODERATOR");
        _;
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "PixD: INVALID_MODERATOR");

        moderators[moderator] = approved;

        emit ModeratorUpdated(moderator, approved);
    }

    function _baseURI() internal pure override returns (string memory) {
        return _baseTokenURI;
    }

    function mint(address to, uint256 tokenId) external override onlyMod {
        _safeMint(to, tokenId);

        emit PIXDMinted(to, tokenId);
    }
}
