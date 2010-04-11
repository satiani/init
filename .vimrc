syntax on
set modeline
if &cp | set nocp | endif
let s:cpo_save=&cpo
set cpo&vim
map! <xHome> <Home>
map! <xEnd> <End>
map! <S-xF4> <S-F4>
map! <S-xF3> <S-F3>
map! <S-xF2> <S-F2>
map! <S-xF1> <S-F1>
map! <xF4> <F4>
map! <xF3> <F3>
map! <xF2> <F2>
map! <xF1> <F1>
map <xHome> <Home>
map <xEnd> <End>
map <S-xF4> <S-F4>
map <S-xF3> <S-F3>
map <S-xF2> <S-F2>
map <S-xF1> <S-F1>
map <xF4> <F4>
map <xF3> <F3>
map <xF2> <F2>
map <xF1> <F1>
map <c-w>O <c-w>w<c-w>_<c-w><bar>
map <c-w>F <c-w>_<c-w><bar>
map \ <c-w>>
map - <c-w><
map <c-d> :s/#/<enter>
map <c-e> <home>i#<esc>
map <silent><A-Right> :tabnext<CR>
map <silent><A-Left> :tabprevious<CR>
map <silent><A-Up> :tabnew .<CR>
map <silent><A-Down> :tabnew<CR>
inoremap <silent><A-Right> <Esc>:tabnext<CR>
inoremap <silent><A-Left> <Esc>:tabprevious<CR>
map <silent> <F6> :call BufferList()<CR>
" VIM-Shell
" Ctrl_W e opens up a vimshell in a horizontally split window
" Ctrl_W E opens up a vimshell in a vertically split window
" The shell window will be auto closed after termination
nmap <C-W>E :new \| vimshell bash<CR>
nmap <C-W>e :vnew \| vimshell bash<CR>
let &cpo=s:cpo_save
unlet s:cpo_save
set autoindent
set background=dark
set backspace=indent,eol,start
set fileencodings=ucs-bom,utf-8,latin1
set history=50
set printoptions=paper:letter
set ruler
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set viminfo='20,\"50
set sts=4
set expandtab
set et
set sw=4
set showmatch		" Show matching brackets.
set incsearch
set diffopt=vertical,filler
set diffexpr="sdiff --strip-trailing-cr"
set directory=/home/satiani/vimswap/
set completeopt=longest,menuone

function! CHANGE_CURR_DIR()
    if !exists("b:eclim_temp_window")
        let _dir = expand("%:p:h")
        exec join(["cd", escape(_dir, " ")])
        unlet _dir
    endif
endfunction

"disabled because of collisions with eclim
"autocmd BufEnter * call CHANGE_CURR_DIR()
set t_Co=256
colorscheme desert256
set hidden
set wildmenu

autocmd FileType python compiler pylint
let g:pylint_onwrite = 0

" Python extensions
" 
" This part is not very useful, adds too much noise
" python << EOF
" import os
" import sys
" import vim
" for p in sys.path:
"     if os.path.isdir(p):
"         vim.command(r"set path+=%s" % (p.replace(" ", r"\ ")))
" EOF
"
" This doesn't work very well either
" set tags+=$HOME/.vim/tags/python.ctags
"
"autocmd FileType python set omnifunc=pythoncomplete#Complete
"
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

vim.command('map <f7> :py SetBreakpoint()<cr>')

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

vim.command( 'map <s-f7> :py RemoveBreakpoints()<cr>')
vim.command( 'map <C-h> :py EvaluateCurrentRange()<cr>')
EOF

highlight OverLength ctermbg=red ctermfg=white guibg=#592929
"match OverLength /\%81v.*/

"
""Eclipse Stuff
"filetype plugin on
"map <F3> <Esc>:ProjectsTree<CR>
"let g:EclimProjectTreeActions = [
"    \ {'pattern': '.*', 'name': 'Edit', 'action': 'edit'},
"    \ {'pattern': '.*', 'name': 'Tab', 'action': 'tabnew'},
"    \ {'pattern': '.*', 'name': 'Split', 'action': 'split'},
"  \ ]
"
"let g:EclimVcsTrackerIdPatterns = ['#\(\d\+\)',
"                                 \ '[Cc][Aa][Ss][Ee]\s*\(\d\+\)',
"                                 \ '[Ff][Bb]\s*\(\d\+\)',
"                                 \ '[Ff][Oo][Gg][Bb][Uu][Gg][Zz]\s*\(\d\+\)']
"
"let g:EclimProjectTreeAutoOpen=0
"let g:EclimBuffersDefaultAction="edit"
"let g:EclimLocateFileDefaultAction="edit"
"" When vim fails to detect the correct fileformat for a dos file, use F12 to
"" force it to be read as a dos file
"map <silent><F12> <Esc>:set fileformats=<CR><Esc>:e ++ff=dos<CR><Esc>:set fileformats=unix,dos<CR>
"map <silent><F11> <Esc>:set fileformats=<CR><Esc>:e ++ff=unix<CR><Esc>:set fileformats=unix,dos<CR>
"
"" This is a hack to rapidly start looking for filesonce you open vim
"" It's very brittle and will only work with views project
"function! OpenViewsFileIfEmpty()
"    let buff_name = buffer_name('%')
"    let is_tree = stridx(buff_name, 'ProjectTree')
"    if is_tree > -1
"        winc l
"        let buff_name = buffer_name('%')
"    endif
"    if buff_name == ''
"        exec 'view /home/satiani/code/workspace/views/Makefile'
"    endif
"endfunction 
"map <silent><F10> <Esc>:call OpenViewsFileIfEmpty()<CR><Esc>:LocateFile<CR>
"nnoremap \z :setlocal foldexpr=(getline(v:lnum)=~@/)?0:(getline(v:lnum-1)=~@/)\\|\\|(getline(v:lnum+1)=~@/)?1:2 foldmethod=expr foldlevel=0 foldcolumn=2<CR>
"set omnifunc=
