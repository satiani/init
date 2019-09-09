" Vim config
" Samer Atiani - 2018
" Preamble {{{
" vim:foldmethod=marker:number
if &compatible
  set nocompatible               " Be iMproved
endif
let &runtimepath.=','. getcwd()
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
Plug 'sakhnik/nvim-gdb', { 'branch': 'legacy' }
Plug 'mpyatishev/vim-sqlformat'
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
Plug 'ternjs/tern_for_vim'
Plug 'Shougo/neco-vim'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'neoclide/coc.nvim', {'branch': 'release'}
" }}}
" Modes {{{
Plug 'jceb/vim-orgmode'
Plug 'vim-scripts/utl.vim'
" }}}
" Vim tools {{{
Plug 'mattn/calendar-vim'
" }}}
call plug#end()
" }}}
" Circuit breaker {{{
" Start VIMINIT='let g:first_time_install=1' vim to load plugins only without continuing the rest of
" the script
if get(g:, 'first_time_install', 0) == 1
  finish
endif
" }}}

" Vim options {{{
" General options {{{
set termguicolors
colorscheme falcon
filetype plugin on
filetype indent on
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
set ts=4
set sw=4
set tags=tags;/
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo,uploads/*
set noshowmode
set formatoptions-=tc
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
map <Leader>f :exec("gr " . expand("<cword>"))<CR>
map <Leader>o :belowright 10split +term<CR><C-\><C-n>:set wfh<CR>:set wfw<CR>i
map <Leader>t :tabnew +term<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
" Copy file path and line number to register " (default yank register)
map <Leader>ln :let @"=join([expand('%'),  line(".")], ':')<CR>
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

function! LightlineName(expansionArguments)
  return &filetype ==# 'fzf' ? '' :
        \ &filetype ==# 'help' ? '' :
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
      \                [ 'tagbar', 'filetype', 'cocstatus', 'charvaluehex'] ],
      \     'left': [ [ 'mode', 'paste' ],
      \               [ 'readonly', 'relativepath', 'modified' ] ],
      \ },
      \ 'inactive': {
      \     'left': [ [ 'filename', 'modified'] ],
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
      \     'tagbar': 'LightlineTagbar',
      \     'cocstatus': 'coc#status',
      \ },
      \ }
" }}}
" ale {{{
let g:ale_fixers={
\    'python': ['isort', 'autopep8'],
\    'javascript': ['standard'],
\    'json': ['fixjson'],
\    'rust': ['rustfmt'],
\    'cs': ['uncrustify'],
\    'xml': ['xmllint'],
\    'go': [],
\}
let g:ale_linters={
\    'javascript': ['standard'],
\    'python': ['flake8'],
\    'go': [],
\}
let g:ale_rust_rls_toolchain = 'stable'
let ale_blacklist = ['go']
au BufEnter * if index(ale_blacklist, &ft) < 0 | nmap <buffer> <Leader>F <Plug>(ale_fix)
au BufEnter * if index(ale_blacklist, &ft) < 0 | nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>
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
" }}}
" vim-sleuth {{{
" Disables behavior by vim-sleuth where it will turn on filetype indent
let g:did_indent_on = 0
" }}}
" tern for vim {{{
let g:tern#command = [expand("~/.langservers/javascript/run.sh")]
let g:tern#arguments = ["--persistent"]
au FileType javascript map <buffer> <Leader>d :TernDef<CR>
au FileType javascript map <buffer> <Leader>r :TernRename<CR>
" }}}
" jedi-vim {{{
let g:jedi#completions_enabled = 0
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
" vim-go {{{
let g:go_list_type = "locationlist"
let g:go_def_mode='godef'
let g:go_list_autoclose = 0
let g:go_def_mapping_enabled = 0
" }}}
" coc.nvim {{{
call coc#add_extension(
    \ 'coc-json',
    \ 'coc-tsserver',
    \ 'coc-rls',
    \ 'coc-snippets',
    \ )
" Use TAB to trigger completion, snippet expand and jump
inoremap <silent><expr> <TAB>
  \ pumvisible() ? coc#_select_confirm() :
  \ coc#expandableOrJumpable() ? "\<C-r>=coc#rpc#request('doKeymap', ['snippets-expand-jump',''])\<CR>" :
  \ <SID>check_back_space() ? "\<TAB>" :
  \ coc#refresh()

function! s:check_back_space() abort
  let col = col('.') - 1
  return !col || getline('.')[col - 1]  =~# '\s'
endfunction

let g:coc_snippet_next = '<tab>'
set updatetime=300
set shortmess+=c
nmap <silent> [c <Plug>(coc-diagnostic-prev)
nmap <silent> ]c <Plug>(coc-diagnostic-next)
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)
nmap <leader>rn <Plug>(coc-rename)
xmap <leader>a  <Plug>(coc-codeaction-selected)
nmap <leader>a  <Plug>(coc-codeaction-selected)
nmap <leader>ac  <Plug>(coc-codeaction)
nmap <leader>F  <Plug>(coc-fix-current)

nnoremap <silent> K :call <SID>show_documentation()<CR>
function! s:show_documentation()
  if (index(['vim','help'], &filetype) >= 0)
    execute 'h '.expand('<cword>')
  else
    call CocAction('doHover')
  endif
endfunction

autocmd CursorHold * silent call CocActionAsync('highlight')
augroup mygroup
  autocmd!
  " Setup formatexpr specified filetype(s).
  autocmd FileType typescript,json setl formatexpr=CocAction('formatSelected')
  " Update signature help on jump placeholder
  autocmd User CocJumpPlaceholder call CocActionAsync('showSignatureHelp')
augroup end
" }}}
" utl {{{
let g:utl_cfg_hdl_scm_http_system = "silent !open -a '/Applications/Google Chrome.app' '%u'"
" }}}
" orgmode {{{
let g:org_agenda_files = ['~/Dropbox/orgmode/*.org']
let g:org_todo_keywords=['TODO', 'FEEDBACK', 'VERIFY', '|', 'DONE']
" }}}
" python_host_prog {{{
let g:python_host_prog=expand('~/.local/python-envs/venv2/bin/python')
let g:python3_host_prog=expand('~/.local/python-envs/venv3/bin/python3')
" }}}
