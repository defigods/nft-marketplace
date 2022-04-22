//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract PIX is OwnableUpgradeable {
    enum Status {
        InProduction,
        Active,
        Completed,
        Closed
    }
    struct Proposal {
        string description;
        Status status;
        uint256 createdTime;
        uint256 power1;
        uint256 power2;
        uint256 isApproved;
        mapping(address => uint256) staked;
        uint256 replies;
    }

    event ProposalCreated(uint256 pid);
    event Voted(uint256 pid, bool status);
    event ProposalClosed(uint256 pid);
    event Withdrawn(uint256 indexed pid, uint256 amount, address account);

    uint256 public pid;
    mapping(uint256 => Proposal) public proposal;
    IERC20Upgradeable public pixToken;
    uint256 public period;

    function initialize(address _pixt, uint256 _period) public initializer {
        require(_pixt != address(0), "Pix: INVALID_PIXT");
        __Ownable_init();
        pixToken = IERC20Upgradeable(_pixt);
        period = _period;
    }

    function createProposal(string calldata _description) external {
        require(pixToken.balanceOf(msg.sender) >= 1e18, "createProposal: insufficiency balance");
        Proposal storage _proposal = proposal[pid];
        _proposal.description = _description;
        _proposal.createdTime = block.timestamp;

        emit ProposalCreated(pid);
        pid += 1;
    }

    function voting(
        uint256 _pid,
        uint256 _amount,
        bool status
    ) external {
        require(pixToken.balanceOf(msg.sender) >= _amount, "voting: insufficiency balance");
        Proposal storage _proposal = proposal[_pid];

        if (_proposal.staked[msg.sender] == 0) {
            _proposal.replies += 1;
        }

        pixToken.transferFrom(msg.sender, address(this), _amount);
        _proposal.staked[msg.sender] += _amount;

        if (status) {
            _proposal.power1 += _amount;
        } else {
            _proposal.power2 += _amount;
        }
        if (_proposal.power1 > 0) {
            _proposal.status = Status.Active;
        }
        if (_proposal.createdTime + period >= block.timestamp) {
            _proposal.status = Status.Completed;
        }

        emit Voted(_pid, status);
    }

    function closeProposal(uint256 _pid) external onlyOwner {
        Proposal storage _proposal = proposal[_pid];
        _proposal.status = Status.Closed;

        emit ProposalClosed(_pid);
    }

    function withdraw(uint256 _pid) external {
        Proposal storage _proposal = proposal[_pid];
        require(
            _proposal.status == Status.Completed || _proposal.status == Status.Closed,
            "withdraw: proposal still active"
        );
        pixToken.transfer(msg.sender, _proposal.staked[msg.sender]);
        delete _proposal.staked[msg.sender];

        emit Withdrawn(_pid, _proposal.staked[msg.sender], msg.sender);
    }
}
