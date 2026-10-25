# PSScriptAnalyzer rule set for xp-gate Gate 1.
#
# Required by adapters/powershell.sh whenever .xp-gate-powershell-analysis-paths
# is in use: analysing with an *unknown* rule set is refused (fail-closed), so
# the rule set has to be declared rather than inherited from whatever the
# machine's PSScriptAnalyzer defaults happen to be.
#
# Severity is filtered to Error,Warning by the adapter, so Info-level findings
# never block. The rules enabled here are the ones that matter for a utility
# script in this repo: correctness, injection, and portability.
#
# See .xp-gate-powershell-analysis-paths and xp-gate #595 for the context.
@{
    IncludeDefaultRules = $true
    Severity            = @('Error', 'Warning')

    Rules               = @{
        # A script that hides its output behind Write-Host is the failure mode
        # this repo keeps hitting in the gate tooling; keep output capturable.
        PSAvoidUsingWriteHost                        = @{
            Enable = $true
        }
        PSAvoidUsingInvokeExpression                 = @{
            Enable = $true
        }
        PSAvoidUsingPlainTextForPassword             = @{
            Enable = $true
        }
        PSPossibleIncorrectComparisonWithNull        = @{
            Enable = $true
        }
        PSUseApprovedVerbs                           = @{
            Enable = $true
        }
        PSUseShouldProcessForStateChangingFunctions  = @{
            Enable = $true
        }
        PSReviewUnusedParameter                      = @{
            Enable = $false
        }
    }
}
