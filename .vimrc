" Vim config
" Samer Atiani - 2018
" Preamble {{{
" vim:foldmethod=marker:number
if &compatible
  set nocompatible               " Be iMproved
endif
" }}}

" Plugins {{{
call plug#begin('~/.local/share/nvim/plugged')
" Snippets {{{
Plug 'SirVer/ultisnips'
Plug 'honza/vim-snippets'
" }}}
" Syntax {{{
" javascript
Plug 'aaronj1335/underscore-templates.vim'
Plug 'leafgarland/typescript-vim'
Plug 'mklabs/vim-backbone'
Plug 'mxw/vim-jsx'
Plug 'pangloss/vim-javascript'
" css
Plug 'ap/vim-css-color'
" jinja
Plug 'lepture/vim-jinja'
" python
Plug 'Yggdroot/indentLine'
" }}}
" Navigation {{{
Plug 'easymotion/vim-easymotion'
Plug 'junegunn/fzf.vim'
Plug 'majutsushi/tagbar'
Plug 'satiani/bufferlist.vim'
Plug 'scrooloose/nerdtree'
Plug 'sjl/gundo.vim'
Plug '~/.fzf'
" }}}
" Text manipulation {{{
Plug 'junegunn/vim-easy-align'
Plug 'mattn/emmet-vim'
Plug 'terryma/vim-multiple-cursors'
Plug 'tpope/vim-speeddating'
Plug 'triglav/vim-visual-increment'
" }}}
" Code completion {{{
Plug 'roxma/nvim-yarp'
if !has('nvim')
  Plug 'roxma/vim-hug-neovim-rpc'
endif
Plug 'ncm2/ncm2'
Plug 'ncm2/ncm2-jedi'
Plug 'ncm2/ncm2-path'
Plug 'ncm2/ncm2-tern'
Plug 'ncm2/ncm2-ultisnips'
Plug 'ncm2/ncm2-vim'
" }}}
" Version control {{{
Plug 'tpope/vim-fugitive'
" }}}
" Styling {{{
Plug 'fenetikm/falcon', {'do': 'patch -p0 < ~/code/init/falcon.patch'}
Plug 'flazz/vim-colorschemes'
Plug 'itchyny/lightline.vim'
Plug 'luochen1990/rainbow'
Plug 'maximbaz/lightline-ale'
Plug 'xolox/vim-colorscheme-switcher'
Plug 'xolox/vim-misc'
" }}}
" External integrations {{{
Plug 'ecerulm/vim-nose'
Plug 'janko-m/vim-test'
Plug 'w0rp/ale'
" }}}
" Enhanced Vim behavior {{{
Plug 'bronson/vim-visual-star-search'
Plug 'henrik/vim-indexed-search'
Plug 'junegunn/vim-peekaboo'
Plug 'lambdalisue/suda.vim'
Plug 'tmhedberg/matchit'
Plug 'tpope/vim-repeat'
Plug 'tpope/vim-sleuth'
Plug 'tpope/vim-unimpaired'
Plug 'vim-scripts/LargeFile'
" }}}
" Language Intelligence {{{
Plug 'davidhalter/jedi-vim'
Plug 'mhartington/nvim-typescript'
Plug 'ternjs/tern_for_vim'
Plug 'Shougo/neco-vim'
" }}}
" Modes {{{
Plug 'jceb/vim-orgmode'
" }}}
" Vim tools {{{
Plug 'mattn/calendar-vim'
" }}}
call plug#end()
" }}}

" Vim options {{{
" General options {{{
set termguicolors
colorscheme falcon
filetype plugin on
filetype indent off
syntax enable
set directory=$HOME/vimswap/
set undofile
set undodir=$HOME/vimswap/
set backspace=indent,eol,start
set completeopt=noinsert,menuone,noselect
set tw=100
set diffopt=vertical,filler
set expandtab
if executable("rg")
  set grepprg=rg\ --vimgrep\ --no-heading
  set grepformat=%f:%l:%c:%m,%f:%l:%m
endif
set autoindent
set hidden
set history=1000
set ignorecase
set incsearch
set modeline
set showmatch		" Show matching brackets.
set smartcase
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set sts=4
set sw=4
set tags=tags;/
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo,uploads/*
set noshowmode
" }}}
" terminal options {{{
tnoremap <C-w> <C-\><C-N><C-w>
tmap <C-o> <C-\><C-n>
augroup terminal
  au!
  " Temporarily prevent recording inside terminals until I develop the muscle memory
  " no to click q after selecting text (which is how I exit copy mode in tmux)
  au TermOpen * map <buffer> q <Nop>
  au BufEnter,FocusGained,BufEnter,BufWinEnter,WinEnter term://* map <buffer> q <Nop>
  au TermOpen * startinsert
augroup END
" }}}
" Key mappings {{{
let mapleader=","
let maplocalleader="\\"
map <F1> <nop>
map <Leader>q :botright cwindow<CR>
map <Leader>Q :botright lwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>f :exec("Rg " . expand("<cword>"))<CR>
map <Leader>o :belowright 10split +term<CR><C-\><C-n>:set wfh<CR>:set wfw<CR>i
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>
map î <A-n>
" Click F10 to get the highlight group under cursor
" (http://vim.wikia.com/wiki/Identify_the_syntax_highlighting_group_used_at_the_cursor)
map <F10> :echo "hi<" . synIDattr(synID(line("."),col("."),1),"name") . '> trans<'
\ . synIDattr(synID(line("."),col("."),0),"name") . "> lo<"
\ . synIDattr(synIDtrans(synID(line("."),col("."),1)),"name") . ">"<CR>
" }}}
" autcmds {{{
augroup general_autocmds
  au!
  au FileType   javascript,python,sh,c,cpp,java,html,css,php,vim
\               au BufWrite * %s/\s\+$//e
augroup END
" }}}
" }}}
" vimplug{{{
map <F9> :source ~/.vimrc<CR>:PlugClean<CR>:PlugInstall<CR>
" }}}
" Bufferlist {{{
map <silent> <F2> :call BufferList()<CR>
hi BufferSelected term=reverse ctermfg=black ctermbg=white cterm=NONE
hi BufferNormal term=NONE ctermfg=188 ctermbg=237 cterm=NONE
let g:BufferListMaxWidth = 60
" }}}
" Rainbow Parentheses {{{
let g:rainbow_active = 1
" }}}
" FZF {{{
command! FZFMru call fzf#run({
\ 'source':  reverse(s:all_files()),
\ 'sink':    'edit',
\ 'options': '-m -x +s',
\ 'down':    '40%' })

function! s:all_files()
  return extend(
  \ reverse(filter(copy(v:oldfiles),
  \        "v:val !~ 'fugitive:\\|NERD_tree\\|^/tmp/\\|.git/\\|term:\\|_Gundo_'")),
  \ map(filter(range(1, bufnr('$')), 'buflisted(v:val)'), 'bufname(v:val)'))
endfunction
nnoremap <C-p> :Files<CR>
nnoremap <C-l> :BTags<CR>
nnoremap <C-b> :FZFMru<CR>
nnoremap <C-e> :History:<CR>
nnoremap <C-h> :Helptags<CR>
let $FZF_DEFAULT_OPTS = '--bind ctrl-d:page-down,ctrl-u:page-up'
let $FZF_DEFAULT_COMMAND = 'rg --hidden --files --follow --glob "!.git/*" 2>/dev/null'
let g:fzf_history_dir = '~/.local/share/fzf-history'
" }}}
" Lightline {{{
function! LightlineMode()
  return expand('%:t') ==# '__Tagbar__' ? 'Tagbar':
        \ &filetype ==# 'fzf' ? 'FZF' :
        \ lightline#mode()
endfunction

function! GetTerminalProcessAndPid()
  let splitArray = split(expand('%'), ':')
  let processName = splitArray[-1]
  let pid = split(splitArray[-2], '//')[1]
  return processName . ' (' . pid . ')'
endfunction

function! LightlineName(expansionArguments)
  return &filetype ==# 'fzf' ? '' :
        \ &filetype ==# 'help' ? '' :
        \ &buftype ==# 'terminal' ? GetTerminalProcessAndPid() :
        \ expand('%:t') !=# '' ? expand(a:expansionArguments) : '[No Name]'
endfunction

function! LightlineTagbar()
    let fileSize = getfsize(expand(@%))
    if fileSize > 10485760 " 10 MiB
        return ""
    endif
    return tagbar#currenttag("%s", "", "f")
endfunction

let g:lightline = {
      \ 'colorscheme': 'nord',
      \ 'active': {
      \     'right': [ [ 'linter_checking', 'linter_errors', 'linter_warnings', 'linter_ok' ],
      \                [ 'lineinfo' ],
      \                [ 'percent' ],
      \                [ 'tagbar', 'filetype', 'charvaluehex'] ],
      \     'left': [ [ 'mode', 'paste' ],
      \               [ 'readonly', 'relativepath', 'modified' ] ],
      \ },
      \ 'inactive': {
      \     'left': [ [ 'filename' ] ],
      \ },
      \ 'component': {
      \     'charvaluehex': '0x%B',
      \     'relativepath': '%{LightlineName("%:f")}',
      \     'filename': '%{LightlineName("%:t")}'
      \ },
      \ 'component_expand': {
      \     'linter_checking': 'lightline#ale#checking',
      \     'linter_warnings': 'lightline#ale#warnings',
      \     'linter_errors': 'lightline#ale#errors',
      \     'linter_ok': 'lightline#ale#ok',
      \ },
      \ 'component_type': {
      \     'linter_checking': 'left',
      \     'linter_warnings': 'warning',
      \     'linter_errors': 'error',
      \     'linter_ok': 'left',
      \ },
      \ 'component_visible_condition': {
      \     'modified': '&modified||(!&modifiable && &buftype !=# "terminal")'
      \ },
      \ 'component_function': {
      \     'mode': 'LightlineMode',
      \     'tagbar': 'LightlineTagbar'
      \ },
      \ }
" }}}
" ale {{{
let g:ale_fixers={
\    'python': ['isort', 'autopep8'],
\    'javascript': ['standard'],
\    'json': ['fixjson']
\}
let g:ale_linters={
\    'javascript': ['standard'],
\}
nmap <Leader>F <Plug>(ale_fix)
nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>
highlight ALEError ctermbg=140
let g:ale_sign_error = '●' " Less aggressive than the default '>>'
let g:ale_sign_warning = '.'
" let g:ale_lint_on_enter = 0 " Less distracting when opening a new file
" let g:ale_python_mypy_options = '--py2 --silent-imports --fast-parser -i'
" }}}
" Fugitive {{{
map <Leader>G :Gstatus<CR>
" }}}
" NERDTree {{{
function! SwitchToNerdTree(path)
    if exists("t:NERDTreeBufName")
        let winnr = bufwinnr(t:NERDTreeBufName)
        let currwinnr = bufwinnr("%")
        if winnr != -1 && winnr != currwinnr
            exec(winnr . "wincmd w")
            return
        elseif winnr != -1
            NERDTreeToggle
            return
        endif
    endif

    if a:path == ""
        NERDTreeToggle
    else
        exec("NERDTree " . a:path)
    endif
endfunction
let NERDTreeHijackNetrw = 0
let NERDTreeWinSize = 40
let NERDTreeIgnore = ['\.pyc$', '__pycache__']
let NERDTreeQuitOnOpen = 1
map <silent><F3> :call SwitchToNerdTree("")<CR>
map <silent><F4> :call SwitchToNerdTree("%")<CR>
" }}}
" UtilSnips {{{
let g:UltiSnipsExpandTrigger="<s-tab>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-k>"
let g:UltiSnipsEditSplit="vertical"
" }}}
" vim-easy-align {{{
xmap ga <Plug>(EasyAlign)
let g:easy_align_ignore_groups = []
" }}}
" Tagbar {{{
map <silent><F5>  :TagbarToggle<CR>
let g:tagbar_left = 1
let g:tagbar_autoclose = 1
let g:tagbar_ctags_bin = '/usr/bin/ctags'
" }}}
" vim-sleuth {{{
" Disables behavior by vim-sleuth where it will turn on filetype indent
let g:did_indent_on = 0
" }}}
" tern for vim {{{
let g:tern#command = [expand("~/.langservers/javascript/run.sh")]
let g:tern#arguments = ["--persistent"]
au FileType javascript map <buffer> <Leader>D :TernDef<CR>
au FileType javascript map <buffer> <Leader>d :TernDefPreview<CR>
au FileType javascript map <buffer> <Leader>r :TernRename<CR>
" }}}
" jedi-vim {{{
let g:jedi#completions_enabled = 0
" }}}
" ncm2 {{{
autocmd BufEnter  *  call ncm2#enable_for_buffer()
inoremap <silent><expr> <TAB> pumvisible() ? "\<C-n>" : "\<TAB>"
inoremap <silent><expr> <c-d> pumvisible() ? "\<PageDown>" : "\<c-d>"
inoremap <silent><expr> <c-u> pumvisible() ? "\<PageUp>" : "\<c-u>"
" add tern to runtimepath so it gets caught by ncm2_tern
let &runtimepath.=','.escape(expand('~/.langservers/javascript/'), '\,')
" UltiSnips+NCM function parameter expansion

" We don't really want UltiSnips to map these two, but there's no option for
" that so just make it map them to a <Plug> key.
let g:UltiSnipsExpandTrigger       = "<Plug>(ultisnips_expand_or_jump)"
let g:UltiSnipsJumpForwardTrigger  = "<Plug>(ultisnips_expand_or_jump)"
" Let UltiSnips bind the jump backward trigger as there's nothing special
" about it.
let g:UltiSnipsJumpBackwardTrigger = "<S-Tab>"

" Try expanding snippet or jumping with UltiSnips and return <Tab> if nothing
" worked.
function! UltiSnipsExpandOrJumpOrTab()
  call UltiSnips#ExpandSnippetOrJump()
  if g:ulti_expand_or_jump_res > 0
    return ""
  else
    return "\<Tab>"
  endif
endfunction

" First try expanding with ncm2_ultisnips. This does both LSP snippets and
" normal snippets when there's a completion popup visible.
inoremap <silent> <expr> <Tab> ncm2_ultisnips#expand_or("\<Plug>(ultisnips_try_expand)")

" If that failed, try the UltiSnips expand or jump function. This handles
" short snippets when the completion popup isn't visible yet as well as
" jumping forward from the insert mode. Writes <Tab> if there is no special
" action taken.
inoremap <silent> <Plug>(ultisnips_try_expand) <C-R>=UltiSnipsExpandOrJumpOrTab()<CR>

" Select mode mapping for jumping forward with <Tab>.
snoremap <silent> <Tab> <Esc>:call UltiSnips#ExpandSnippetOrJump()<cr>
" }}}
" gundo {{{
map <Leader>u :GundoToggle<CR>
" }}}
" indentLine {{{
let g:indentLine_fileType = ['python']
" }}}
" vim-test {{{
nmap <silent> t<C-n> :TestNearest<CR>
nmap <silent> t<C-f> :TestFile<CR>
nmap <silent> t<C-s> :TestSuite<CR>
nmap <silent> t<C-l> :TestLast<CR>
nmap <silent> t<C-g> :TestVisit<CR>
let test#python#runner = "nose"
let test#strategy = "neovim"
let g:test#preserve_screen = 1
let test#neovim#term_position = "belowright 10split"
" }}}
" liwwa {{{
augroup liwwa
  au!
  au BufWritePost *.py :silent !~/code/web/bin/compile_all.sh
  au BufEnter ~/code/web/app/static/**/*.html :set syntax=underscore_template
  au BufEnter *.html :silent RainbowToggleOff
augroup END
" }}}
" python_host_prog {{{
let g:python_host_prog=expand('~/.local/python-envs/venv2/bin/python')
let g:python3_host_prog=expand('~/.local/python-envs/venv3/bin/python3')
" }}}
