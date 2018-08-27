"dein Scripts-----------------------------
if &compatible
  set nocompatible               " Be iMproved
endif

" Required:
set runtimepath+=/home/satiani/.cache/dein/repos/github.com/Shougo/dein.vim

" Required:
if dein#load_state('/home/satiani/.cache/dein')
  call dein#begin('/home/satiani/.cache/dein')

  " Let dein manage dein
  " Required:
  call dein#add('/home/satiani/.cache/dein/repos/github.com/Shougo/dein.vim')

  " Add or remove your plugins here:
  " Snippets
  call dein#add('SirVer/ultisnips')
  call dein#add('honza/vim-snippets')
  " Syntax
  call dein#add('isRuslan/vim-es6')
  call dein#add('ap/vim-css-color')
  " Navigation
  call dein#add('junegunn/fzf', { 'build': './install' })
  call dein#add('junegunn/fzf.vim', { 'depends': 'junegunn/fzf' })
  call dein#add('easymotion/vim-easymotion')
  call dein#add('roblillack/vim-bufferlist')
  call dein#add('scrooloose/nerdtree')
  call dein#add('majutsushi/tagbar')
  " Text manipulation
  call dein#add('junegunn/vim-easy-align')
  call dein#add('mattn/emmet-vim')
  call dein#add('maxbrunsfeld/vim-yankstack')
  call dein#add('tpope/vim-speeddating')
  " Code completion
  call dein#add('davidhalter/jedi-vim')
  " Version control
  call dein#add('tpope/vim-fugitive')
  call dein#add('airblade/vim-gitgutter')
  call dein#add('xuyuanp/nerdtree-git-plugin')
  " Styling
  call dein#add('vim-airline/vim-airline')
  call dein#add('vim-airline/vim-airline-themes')
  call dein#add('flazz/vim-colorschemes')
  call dein#add('luochen1990/rainbow')
  call dein#add('edkolev/tmuxline.vim')
  " External integrations
  call dein#add('w0rp/ale')
  call dein#add('benmills/vimux')
  call dein#add('pitluga/vimux-nose-test')
  call dein#add('tmux-plugins/vim-tmux-focus-events')
  call dein#add('roxma/vim-tmux-clipboard', { 'depends': 'tmux-plugins/vim-tmux-focus-events' })
  " Enhanced Vim behavior
  call dein#add('tpope/vim-eunuch')
  call dein#add('tpope/vim-unimpaired')
  call dein#add('tpope/vim-sleuth')
  call dein#add('tpope/vim-repeat')
  call dein#add('henrik/vim-indexed-search')
  " Modes
  call dein#add('jceb/vim-orgmode')

  " Required:
  call dein#end()
  call dein#save_state()
endif

" Required:
filetype plugin indent on
syntax enable

if dein#check_install()
  call dein#install()
endif

"End dein Scripts-------------------------

"#############################################

" Vim options
set backspace=indent,eol,start
set completeopt=longest,menuone
set tw=120
set diffopt=vertical,filler
set expandtab
if executable("rg")
    set grepprg=rg\ --vimgrep\ --no-heading
    set grepformat=%f:%l:%c:%m,%f:%l:%m
endif
set autoindent
set hidden
set history=50
set ignorecase
set incsearch
set modeline
set showmatch		" Show matching brackets.
set smartcase
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set sts=4
set sw=4
set t_Co=256
set tags=tags;/
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo,uploads/*

"" Key mappings
let mapleader=","
let maplocalleader="\\"
map <F1> <nop>
map <Leader>q :botright cwindow<CR>
map <Leader>Q :botright lwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>f :exec("gr " . expand("<cword>"))<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map <Leader>S :!~/bin/parse_sql.py<CR>
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>

" If you want to install not installed plugins on startup.
"if dein#check_install()
"  call dein#install()
"endif

"End dein Scripts-------------------------

set directory=$HOME/vimswap/
set undofile
set undodir=$HOME/vimswap/
syntax on
colorscheme zenburn

" Bufferlist
map <silent> <F2> :call BufferList()<CR>
hi BufferSelected term=reverse ctermfg=black ctermbg=white cterm=bold
hi BufferNormal term=NONE ctermfg=lightgrey ctermbg=black cterm=NONE
let g:BufferListMaxWidth = 60

" Rainbow Parentheses
let g:rainbow_active = 1

" FZF
nnoremap <C-p> :Files<CR>
nnoremap <C-l> :BLines<CR>
nnoremap <C-b> :Buffers<CR>
nnoremap <C-c> :History:<CR>
nnoremap <C-h> :Helptags<CR>
let $FZF_DEFAULT_OPTS = '--bind ctrl-d:page-down,ctrl-u:page-up'
let $FZF_DEFAULT_COMMAND = 'rg --files --follow --glob "!.git/*"'
let g:fzf_history_dir = '~/.local/share/fzf-history'

" deoplete
let g:deoplete#enable_at_startup = 1

" Gitgutter
set updatetime=100
nmap ]h <Plug>GitGutterNextHunk
nmap [h <Plug>GitGutterPrevHunk

" Airline
let g:airline_powerline_fonts = 1
let g:airline_theme='zenburn'
let g:airline_section_x=airline#section#create_right(['tagbar', ' ', 'filetype'])
let g:airline_section_y=airline#section#create_right([])
let g:airline#extensions#fugitiveline#enabled = 0

" ale
let g:ale_fixers={
\    'python': ['isort', 'autopep8'],
\    'javascript': ['standard']
\}
let g:ale_linters={
\    'javascript': ['standard'],
\}
nmap <Leader>F <Plug>(ale_fix)
nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>:GitGutterToggle<CR>
highlight ALEError ctermbg=140

" Fugitive
map <Leader>G :Gstatus<CR>

" NERDTree
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
let NERDTreeIgnore = ['\.pyc$']
let NERDTreeQuitOnOpen = 1
map <silent><F3> :call SwitchToNerdTree("")<CR>
map <silent><F4> :call SwitchToNerdTree("%")<CR>

" UtilSnips
let g:UltiSnipsExpandTrigger="<tab>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-k>"
let g:UltiSnipsEditSplit="vertical"

" vim-easy-align
xmap ga <Plug>(EasyAlign)
let g:easy_align_ignore_groups = []

" Tagbar
map <silent><F5>  :TagbarToggle<CR>
let g:tagbar_left = 1
let g:tagbar_autoclose = 1
