" Python extensions
if has("python")
python << EOF
import vim
def SetBreakpoint():
    import re
    nLine = int( vim.eval('line(".")'))

    strLine = vim.current.line
    strWhite = re.search('^(\s*)', strLine).group(1)

    vim.current.buffer.append(
        "%(space)spdb.set_trace() %(mark)s Breakpoint %(mark)s" %
        {'space':strWhite, 'mark': '#'*30}, nLine - 1)

    for strLine in vim.current.buffer:
        if strLine == "import pdb":
            break
    else:
        vim.current.buffer.append('import pdb', 0)
        vim.command('normal j1')


def RemoveBreakpoints():
    import re

    nCurrentLine = int( vim.eval( 'line(".")'))

    nLines = []
    nLine = 1
    for strLine in vim.current.buffer:
        if strLine == 'import pdb' or strLine.lstrip()[:15] == 'pdb.set_trace()':
            nLines.append( nLine)
        nLine += 1

    nLines.reverse()

    for nLine in nLines:
        vim.command( 'normal %dG' % nLine)
        vim.command( 'normal dd')
        if nLine < nCurrentLine:
            nCurrentLine -= 1

    vim.command( 'normal %dG' % nCurrentLine)

def EvaluateCurrentRange():
    print "#" * 30
    eval(compile('\n'.join(vim.current.range),'','exec'), globals())
    print "#" * 30

#vim.command( 'map <s-f7> :py RemoveBreakpoints()<cr>')
#vim.command('map <f7> :py SetBreakpoint()<cr>')
vim.command( 'map <C-h> :py EvaluateCurrentRange()<cr>')
EOF
endif

